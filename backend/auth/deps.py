"""FastAPI dependencies for resolving the current user from the session cookie."""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from database import get_db
from models import Session, User

from . import config
from .keys import session_prefix, verify_session_token


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
    if not raw_token:
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


def get_current_user(request: Request, db: DBSession = Depends(get_db)) -> User:
    resolved = _resolve_session(request, db)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return resolved[1]


def get_current_session(request: Request, db: DBSession = Depends(get_db)) -> Session:
    resolved = _resolve_session(request, db)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return resolved[0]


def get_optional_user(request: Request, db: DBSession = Depends(get_db)) -> User | None:
    resolved = _resolve_session(request, db)
    return resolved[1] if resolved else None


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user
