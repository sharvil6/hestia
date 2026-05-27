"""Auth router: invites, word-key enroll/login/rotate, sessions, passkeys, admin."""

import base64
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from auth import config
from auth import keys as keyutil
from auth import passkeys as pk
from auth.deps import (
    clear_session_cookie,
    get_current_session,
    get_current_user,
    require_admin,
    set_session_cookie,
)
from database import get_db
from models import AuthKey, Invite, Passkey, Session, User, WebAuthnChallenge

logger = logging.getLogger("hestia.auth")
router = APIRouter(prefix="/auth", tags=["Auth"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ----- Response/request models -------------------------------------------------

class UserOut(BaseModel):
    id: str
    display_name: str
    avatar_id: Optional[str] = None
    is_admin: bool

    @classmethod
    def of(cls, u: User) -> "UserOut":
        return cls(id=u.id, display_name=u.display_name, avatar_id=u.avatar_id, is_admin=u.is_admin)


class InviteOut(BaseModel):
    code: str
    enroll_url: str
    expires_at: datetime
    intended_display_name: str


class InviteCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)


class InviteInfo(BaseModel):
    display_name: str


class EnrollRequest(BaseModel):
    code: str


class EnrollResponse(BaseModel):
    user: UserOut
    key_words: List[str]
    key_qr_payload: str
    # Native clients (Expo) read this and send it as `Authorization: Bearer ...`
    # because cross-origin cookies in React Native are unreliable. Web ignores it
    # and uses the cookie set on the response.
    session_token: str


class LoginSuccess(BaseModel):
    user: UserOut
    session_token: str


class LoginRequest(BaseModel):
    words: Optional[List[str]] = None
    qr_payload: Optional[str] = None


class SessionOut(BaseModel):
    id_prefix: str
    auth_method: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: Optional[str] = None
    device_label: Optional[str] = None
    current: bool = False


class PasskeyOut(BaseModel):
    id: str
    nickname: str
    created_at: datetime
    last_used_at: Optional[datetime] = None


class PasskeyRename(BaseModel):
    nickname: str = Field(min_length=1, max_length=80)


# ----- Helpers -----------------------------------------------------------------


def _mint_session(
    db: DBSession,
    response: Response,
    request: Request,
    user: User,
    auth_method: str,
) -> tuple[Session, str]:
    """Returns (session_row, raw_token). The raw token is set as a cookie AND
    returned so native clients (Expo) can store it for Bearer-header auth."""
    raw_token, prefix, hashed = keyutil.generate_session_token()
    sess = Session(
        id_prefix=prefix,
        id_hash=hashed,
        user_id=user.id,
        auth_method=auth_method,
        expires_at=_now() + timedelta(days=config.SESSION_TTL_DAYS),
        user_agent=request.headers.get("user-agent"),
        device_label=None,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    set_session_cookie(response, raw_token)
    return sess, raw_token


def _purge_expired_challenges(db: DBSession) -> None:
    db.query(WebAuthnChallenge).filter(WebAuthnChallenge.expires_at < _now()).delete()
    db.commit()


def _active_auth_key_for(db: DBSession, user_id: str) -> Optional[AuthKey]:
    return (
        db.query(AuthKey)
        .filter(AuthKey.user_id == user_id, AuthKey.revoked_at.is_(None))
        .first()
    )


# ----- Invite endpoints --------------------------------------------------------


@router.post("/invites", response_model=InviteOut)
def create_invite(
    body: InviteCreate,
    admin: User = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    code = keyutil.generate_invite_code()
    invite = Invite(
        code=code,
        intended_display_name=body.display_name.strip(),
        created_by_user_id=admin.id,
        expires_at=_now() + timedelta(days=config.INVITE_TTL_DAYS),
    )
    db.add(invite)
    db.commit()
    return InviteOut(
        code=code,
        enroll_url=f"{config.PUBLIC_URL.rstrip('/')}/enroll/{code}",
        expires_at=invite.expires_at,
        intended_display_name=invite.intended_display_name,
    )


@router.get("/invites/{code}", response_model=InviteInfo)
def get_invite(code: str, db: DBSession = Depends(get_db)):
    invite = db.query(Invite).filter(Invite.code == code).first()
    if invite is None or invite.used_at is not None:
        raise HTTPException(status_code=404, detail="invite not found")
    expires = invite.expires_at if invite.expires_at.tzinfo else invite.expires_at.replace(tzinfo=timezone.utc)
    if expires < _now():
        raise HTTPException(status_code=410, detail="invite expired")
    return InviteInfo(display_name=invite.intended_display_name)


# ----- Word-key enroll / login / rotate ----------------------------------------


@router.post("/enroll", response_model=EnrollResponse)
def enroll(
    body: EnrollRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    invite = db.query(Invite).filter(Invite.code == body.code).first()
    if invite is None or invite.used_at is not None:
        raise HTTPException(status_code=404, detail="invite not found")
    expires = invite.expires_at if invite.expires_at.tzinfo else invite.expires_at.replace(tzinfo=timezone.utc)
    if expires < _now():
        raise HTTPException(status_code=410, detail="invite expired")

    raw_key = keyutil.generate_key()
    words = keyutil.key_to_words(raw_key)
    key_id = keyutil.derive_key_id(raw_key)

    user = User(display_name=invite.intended_display_name)
    db.add(user)
    db.flush()  # populate user.id

    auth_key = AuthKey(user_id=user.id, key_id=key_id, key_hash=keyutil.hash_key(raw_key))
    db.add(auth_key)

    invite.used_at = _now()
    invite.used_by_user_id = user.id
    db.commit()

    _, token = _mint_session(db, response, request, user, auth_method="word_key")
    return EnrollResponse(
        user=UserOut.of(user),
        key_words=words,
        key_qr_payload=keyutil.qr_payload(words),
        session_token=token,
    )


@router.post("/login", response_model=LoginSuccess)
def login_with_words(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    if body.qr_payload:
        try:
            words = keyutil.parse_qr_payload(body.qr_payload)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif body.words:
        words = body.words
    else:
        raise HTTPException(status_code=400, detail="provide words or qr_payload")

    try:
        raw = keyutil.words_to_key(words)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    key_id = keyutil.derive_key_id(raw)
    auth_key = (
        db.query(AuthKey)
        .filter(AuthKey.key_id == key_id, AuthKey.revoked_at.is_(None))
        .first()
    )
    if auth_key is None or not keyutil.verify_key(raw, auth_key.key_hash):
        raise HTTPException(status_code=401, detail="invalid key")

    user = db.query(User).filter(User.id == auth_key.user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="invalid key")

    auth_key.last_used_at = _now()
    db.commit()
    _, token = _mint_session(db, response, request, user, auth_method="word_key")
    return LoginSuccess(user=UserOut.of(user), session_token=token)


@router.post("/logout")
def logout(
    response: Response,
    db: DBSession = Depends(get_db),
    sess: Session = Depends(get_current_session),
):
    db.delete(sess)
    db.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.of(user)


@router.post("/rotate-key", response_model=EnrollResponse)
def rotate_key(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    existing = _active_auth_key_for(db, user.id)
    if existing:
        existing.revoked_at = _now()

    raw_key = keyutil.generate_key()
    words = keyutil.key_to_words(raw_key)
    key_id = keyutil.derive_key_id(raw_key)
    new_key = AuthKey(user_id=user.id, key_id=key_id, key_hash=keyutil.hash_key(raw_key))
    db.add(new_key)

    # Invalidate all other word_key sessions; passkey sessions are independent.
    db.query(Session).filter(
        Session.user_id == user.id, Session.auth_method == "word_key"
    ).delete()
    db.commit()

    _, token = _mint_session(db, response, request, user, auth_method="word_key")
    return EnrollResponse(
        user=UserOut.of(user),
        key_words=words,
        key_qr_payload=keyutil.qr_payload(words),
        session_token=token,
    )


# ----- Session management ------------------------------------------------------


@router.get("/sessions", response_model=List[SessionOut])
def list_sessions(
    current: Session = Depends(get_current_session),
    db: DBSession = Depends(get_db),
):
    rows = db.query(Session).filter(Session.user_id == current.user_id).all()
    return [
        SessionOut(
            id_prefix=s.id_prefix,
            auth_method=s.auth_method,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
            expires_at=s.expires_at,
            user_agent=s.user_agent,
            device_label=s.device_label,
            current=(s.id == current.id),
        )
        for s in rows
    ]


@router.delete("/sessions/{id_prefix}")
def revoke_session(
    id_prefix: str,
    current: Session = Depends(get_current_session),
    db: DBSession = Depends(get_db),
):
    sess = (
        db.query(Session)
        .filter(Session.id_prefix == id_prefix, Session.user_id == current.user_id)
        .first()
    )
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")
    db.delete(sess)
    db.commit()
    return {"ok": True}


# ----- Admin: users + revoke key -----------------------------------------------


class AdminUserOut(UserOut):
    has_active_key: bool
    passkey_count: int
    session_count: int
    created_at: datetime


@router.get("/users", response_model=List[AdminUserOut])
def admin_list_users(
    admin: User = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    users = db.query(User).all()
    out: List[AdminUserOut] = []
    for u in users:
        active_key = _active_auth_key_for(db, u.id) is not None
        pk_count = db.query(Passkey).filter(Passkey.user_id == u.id, Passkey.revoked_at.is_(None)).count()
        sess_count = db.query(Session).filter(Session.user_id == u.id).count()
        out.append(AdminUserOut(
            id=u.id, display_name=u.display_name, avatar_id=u.avatar_id, is_admin=u.is_admin,
            has_active_key=active_key, passkey_count=pk_count, session_count=sess_count,
            created_at=u.created_at,
        ))
    return out


@router.post("/users/{user_id}/revoke-key")
def admin_revoke_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    # Revoke active word-key, revoke all passkeys, kill all sessions.
    now = _now()
    db.query(AuthKey).filter(AuthKey.user_id == user_id, AuthKey.revoked_at.is_(None)).update(
        {AuthKey.revoked_at: now}
    )
    db.query(Passkey).filter(Passkey.user_id == user_id, Passkey.revoked_at.is_(None)).update(
        {Passkey.revoked_at: now}
    )
    db.query(Session).filter(Session.user_id == user_id).delete()
    db.commit()
    return {"ok": True}


# ----- Passkey endpoints -------------------------------------------------------


@router.post("/passkeys/register/begin")
def passkey_register_begin(
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    _purge_expired_challenges(db)
    existing_ids = [
        p.credential_id
        for p in db.query(Passkey).filter(Passkey.user_id == user.id, Passkey.revoked_at.is_(None)).all()
    ]
    challenge, options_json = pk.begin_registration(
        user_id=user.id.encode("utf-8"),
        user_name=user.display_name,
        user_display_name=user.display_name,
        exclude_credential_ids=existing_ids,
    )
    db.add(WebAuthnChallenge(
        kind="register",
        challenge=challenge,
        user_id=user.id,
        expires_at=_now() + timedelta(seconds=config.CHALLENGE_TTL_SECONDS),
    ))
    db.commit()
    return json.loads(options_json)


@router.post("/passkeys/register/complete", response_model=PasskeyOut, status_code=201)
def passkey_register_complete(
    credential: dict,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    # Find the most recent unused register-challenge for this user.
    chall = (
        db.query(WebAuthnChallenge)
        .filter(
            WebAuthnChallenge.kind == "register",
            WebAuthnChallenge.user_id == user.id,
            WebAuthnChallenge.expires_at >= _now(),
        )
        .order_by(WebAuthnChallenge.expires_at.desc())
        .first()
    )
    if chall is None:
        raise HTTPException(status_code=400, detail="no active registration challenge")
    try:
        verified = pk.finish_registration(credential=credential, expected_challenge=chall.challenge)
    except Exception as e:
        logger.exception("passkey registration failed")
        raise HTTPException(status_code=400, detail=f"registration failed: {e}")
    finally:
        db.delete(chall)
        db.commit()

    aaguid = verified["aaguid"]
    nickname = pk.friendly_name_for(aaguid)
    new_pk = Passkey(
        user_id=user.id,
        credential_id=verified["credential_id"],
        public_key=verified["public_key"],
        sign_count=verified["sign_count"],
        transports=None,
        aaguid=aaguid,
        nickname=nickname,
    )
    db.add(new_pk)
    db.commit()
    db.refresh(new_pk)
    return PasskeyOut(id=new_pk.id, nickname=new_pk.nickname, created_at=new_pk.created_at, last_used_at=None)


@router.post("/passkeys/login/begin")
def passkey_login_begin(db: DBSession = Depends(get_db)):
    _purge_expired_challenges(db)
    challenge, options_json = pk.begin_authentication()
    db.add(WebAuthnChallenge(
        kind="login",
        challenge=challenge,
        user_id=None,
        expires_at=_now() + timedelta(seconds=config.CHALLENGE_TTL_SECONDS),
    ))
    db.commit()
    return json.loads(options_json)


@router.post("/passkeys/login/complete", response_model=LoginSuccess)
def passkey_login_complete(
    credential: dict,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    raw_id_b64 = credential.get("rawId") or credential.get("id")
    if not raw_id_b64:
        raise HTTPException(status_code=400, detail="missing credential id")
    try:
        # SimpleWebAuthn sends base64url without padding.
        padded = raw_id_b64 + "=" * (-len(raw_id_b64) % 4)
        cred_id_bytes = base64.urlsafe_b64decode(padded)
    except Exception:
        raise HTTPException(status_code=400, detail="bad credential id encoding")

    stored = (
        db.query(Passkey)
        .filter(Passkey.credential_id == cred_id_bytes, Passkey.revoked_at.is_(None))
        .first()
    )
    if stored is None:
        raise HTTPException(status_code=401, detail="unknown passkey")

    chall = (
        db.query(WebAuthnChallenge)
        .filter(
            WebAuthnChallenge.kind == "login",
            WebAuthnChallenge.expires_at >= _now(),
        )
        .order_by(WebAuthnChallenge.expires_at.desc())
        .first()
    )
    if chall is None:
        raise HTTPException(status_code=400, detail="no active login challenge")

    try:
        new_count = pk.finish_authentication(
            credential=credential,
            expected_challenge=chall.challenge,
            stored_public_key=stored.public_key,
            stored_sign_count=stored.sign_count,
        )
    except Exception as e:
        logger.exception("passkey login failed")
        raise HTTPException(status_code=401, detail=f"login failed: {e}")
    finally:
        db.delete(chall)
        db.commit()

    stored.sign_count = new_count
    stored.last_used_at = _now()
    db.commit()

    user = db.query(User).filter(User.id == stored.user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="user gone")
    _, token = _mint_session(db, response, request, user, auth_method="passkey")
    return LoginSuccess(user=UserOut.of(user), session_token=token)


@router.get("/passkeys", response_model=List[PasskeyOut])
def list_passkeys(user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    rows = (
        db.query(Passkey)
        .filter(Passkey.user_id == user.id, Passkey.revoked_at.is_(None))
        .order_by(Passkey.created_at.asc())
        .all()
    )
    return [
        PasskeyOut(id=p.id, nickname=p.nickname, created_at=p.created_at, last_used_at=p.last_used_at)
        for p in rows
    ]


@router.patch("/passkeys/{passkey_id}", response_model=PasskeyOut)
def rename_passkey(
    passkey_id: str,
    body: PasskeyRename,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    p = (
        db.query(Passkey)
        .filter(Passkey.id == passkey_id, Passkey.user_id == user.id, Passkey.revoked_at.is_(None))
        .first()
    )
    if p is None:
        raise HTTPException(status_code=404, detail="passkey not found")
    p.nickname = body.nickname.strip()
    db.commit()
    db.refresh(p)
    return PasskeyOut(id=p.id, nickname=p.nickname, created_at=p.created_at, last_used_at=p.last_used_at)


@router.delete("/passkeys/{passkey_id}")
def revoke_passkey(
    passkey_id: str,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    p = (
        db.query(Passkey)
        .filter(Passkey.id == passkey_id, Passkey.user_id == user.id, Passkey.revoked_at.is_(None))
        .first()
    )
    if p is None:
        raise HTTPException(status_code=404, detail="passkey not found")
    # Word-key is the recovery floor: we never delete a user's only credential.
    # Since the active word-key always exists for an enrolled user, revoking any
    # passkey is safe — they can still recover via words.
    p.revoked_at = _now()
    db.commit()
    return {"ok": True}
