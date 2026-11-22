"""FastAPI dependencies for resolving the current user from the session cookie."""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from database import get_db
from models import ApiToken, Session, User

from . import config
from .keys import api_token_prefix, is_api_token, session_prefix, verify_session_token


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _read_cookie(request: Request) -> str | None:
    return request.cookies.get(config.COOKIE_NAME)


def _read_bearer(request: Request) -> str | None:
    """Native clients (Expo) can't rely on cross-origin cookies and use a
    bearer token instead. Same raw value as the cookie, just different transport."""
    auth = request.headers.get("authorization")
    if not auth:
        return None
    parts = auth.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=config.COOKIE_NAME,
        value=raw_token,
        max_age=config.SESSION_TTL_DAYS * 86400,
        domain=config.COOKIE_DOMAIN,
        secure=config.COOKIE_SECURE,
        httponly=True,
        samesite=config.COOKIE_SAMESITE,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=config.COOKIE_NAME,
        domain=config.COOKIE_DOMAIN,
        path="/",
    )


def _resolve_session(request: Request, db: DBSession) -> tuple[Session, User] | None:
    raw_token = _read_cookie(request) or _read_bearer(request)
    if not raw_token or is_api_token(raw_token):
        return None
    prefix = session_prefix(raw_token)
    sess = db.query(Session).filter(Session.id_prefix == prefix).first()
    if sess is None:
        return None
    if not verify_session_token(raw_token, sess.id_hash):
        return None
    # Both expires_at and "now" need timezone awareness to compare.
    expires = sess.expires_at if sess.expires_at.tzinfo else sess.expires_at.replace(tzinfo=timezone.utc)
    if expires < _now():
        db.delete(sess)
        db.commit()
        return None
    # Sliding expiry.
    sess.last_seen_at = _now()
    sess.expires_at = _now() + timedelta(days=config.SESSION_TTL_DAYS)
    db.commit()
    user = db.query(User).filter(User.id == sess.user_id).first()
    if user is None:
        return None
    return sess, user


# ----- API tokens --------------------------------------------------------------

# Token scopes. Everything not granted here — edits, deletes, annotations,
# drafts, meal plans, URL/image ingest, auth/session/token management, admin —
# needs a real session.
#   read         GET on recipe + tag reads
#   read_create  read, plus POST /recipes/ (create from structured JSON).
#                Deliberately not /recipes/ingest/url: that makes the server
#                fetch arbitrary URLs from inside the home network.
SCOPE_READ = "read"
SCOPE_READ_CREATE = "read_create"
TOKEN_SCOPES = (SCOPE_READ, SCOPE_READ_CREATE)
_CREATE_RECIPE_PATHS = {"/recipes", "/recipes/"}

_READ_SCOPE_PREFIXES = ("/recipes", "/tags")
_READ_SCOPE_DENY_PREFIXES = ("/recipes/drafts",)
_READ_METHODS = {"GET", "HEAD"}
# Don't write last_used_at on every request; a minute's resolution is plenty.
_LAST_USED_RESOLUTION = timedelta(seconds=60)


def _path_matches(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix + "/")


def _read_scope_allows(request: Request) -> bool:
    if request.method not in _READ_METHODS:
        return False
    path = request.url.path
    if any(_path_matches(path, p) for p in _READ_SCOPE_DENY_PREFIXES):
        return False
    return any(_path_matches(path, p) for p in _READ_SCOPE_PREFIXES)


def _scope_allows(scope: str, request: Request) -> bool:
    if scope not in TOKEN_SCOPES:
        return False
    if _read_scope_allows(request):
        return True
    return (
        scope == SCOPE_READ_CREATE
        and request.method == "POST"
        and request.url.path in _CREATE_RECIPE_PATHS
    )


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def authenticate_api_token(raw_token: str | None, db: DBSession) -> tuple[ApiToken, User] | None:
    """Verify a raw `hst_` token (no scope check). Shared by the REST bearer
    path below and the /mcp endpoint, which applies scopes per tool."""
    if not raw_token or not is_api_token(raw_token):
        return None
    tok = (
        db.query(ApiToken)
        .filter(ApiToken.id_prefix == api_token_prefix(raw_token), ApiToken.revoked_at.is_(None))
        .first()
    )
    if tok is None or not verify_session_token(raw_token, tok.id_hash):
        return None
    user = db.query(User).filter(User.id == tok.user_id).first()
    if user is None:
        return None
    now = _now()
    if tok.last_used_at is None or now - _aware(tok.last_used_at) > _LAST_USED_RESOLUTION:
        tok.last_used_at = now
        db.commit()
    return tok, user


def read_bearer(request: Request) -> str | None:
    return _read_bearer(request)


def _resolve_api_token(request: Request, db: DBSession) -> User | None:
    """Bearer-only (never a cookie). Raises 403 for a valid token used outside
    its scope, so callers get a clear "wrong credential" rather than a 401."""
    resolved = authenticate_api_token(_read_bearer(request), db)
    if resolved is None:
        return None
    tok, user = resolved
    if not _scope_allows(tok.scope, request):
        detail = (
            "API token may only read /recipes and /tags and create recipes via POST /recipes/"
            if tok.scope == SCOPE_READ_CREATE
            else "API token is read-only: only GET /recipes and /tags are allowed"
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    # Downstream handlers (recipe create) use this to attribute the action.
    request.state.api_token = tok
    return user


def _resolve_user(request: Request, db: DBSession) -> User | None:
    resolved = _resolve_session(request, db)
    if resolved is not None:
        return resolved[1]
    return _resolve_api_token(request, db)


def get_current_user(request: Request, db: DBSession = Depends(get_db)) -> User:
    user = _resolve_user(request, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return user


def get_current_session(request: Request, db: DBSession = Depends(get_db)) -> Session:
    resolved = _resolve_session(request, db)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return resolved[0]


def get_optional_user(request: Request, db: DBSession = Depends(get_db)) -> User | None:
    return _resolve_user(request, db)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user
