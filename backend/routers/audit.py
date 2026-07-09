"""Admin audit router: authentication activity for the admin dashboard.

All endpoints are admin-gated. Two views:
- `/admin/activity`   — one row per user: are they active, last seen, from where.
- `/admin/auth-events` — the raw event feed (logins, logouts, failed attempts).
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from auth.deps import require_admin
from database import get_db
from models import AuthEvent, Session, User

router = APIRouter(prefix="/admin", tags=["Admin"])


class AuthEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type: str
    user_id: Optional[str] = None
    display_name: Optional[str] = None
    auth_method: Optional[str] = None
    ip: Optional[str] = None
    country: Optional[str] = None
    user_agent: Optional[str] = None
    detail: Optional[str] = None
    created_at: datetime


class UserActivityOut(BaseModel):
    user_id: str
    display_name: str
    is_admin: bool
    active_sessions: int
    last_seen_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    last_ip: Optional[str] = None
    last_country: Optional[str] = None
    login_count: int


@router.get("/activity", response_model=List[UserActivityOut])
def user_activity(
    _admin: User = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """Per-user rollup, most recently active first."""
    # SQLite stores naive datetimes, so compare against a naive "now" for the
    # not-expired filter.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    out: List[UserActivityOut] = []
    for u in db.query(User).all():
        # Only count sessions that haven't expired — stale rows linger until a
        # request re-resolves them, and shouldn't inflate the "active" count.
        live_sessions = db.query(Session).filter(
            Session.user_id == u.id, Session.expires_at > now
        )
        active_sessions = live_sessions.count()
        last_seen = (
            db.query(func.max(Session.last_seen_at))
            .filter(Session.user_id == u.id, Session.expires_at > now)
            .scalar()
        )
        # "enroll" is a first login, so it counts as the most recent sign-in too.
        last_login = (
            db.query(AuthEvent)
            .filter(
                AuthEvent.user_id == u.id,
                AuthEvent.event_type.in_(["login", "enroll"]),
            )
            .order_by(AuthEvent.created_at.desc())
            .first()
        )
        login_count = (
            db.query(AuthEvent)
            .filter(
                AuthEvent.user_id == u.id,
                AuthEvent.event_type.in_(["login", "enroll"]),
            )
            .count()
        )
        out.append(UserActivityOut(
            user_id=u.id,
            display_name=u.display_name,
            is_admin=u.is_admin,
            active_sessions=active_sessions,
            last_seen_at=last_seen,
            last_login_at=last_login.created_at if last_login else None,
            last_ip=last_login.ip if last_login else None,
            last_country=last_login.country if last_login else None,
            login_count=login_count,
        ))

    # SQLite returns naive datetimes, so these are mutually comparable; users
    # with no activity yet sort to the bottom.
    out.sort(key=lambda a: a.last_seen_at or a.last_login_at or datetime.min, reverse=True)
    return out


@router.get("/auth-events", response_model=List[AuthEventOut])
def list_auth_events(
    _admin: User = Depends(require_admin),
    db: DBSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    event_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
):
    """Raw auth event feed, most recent first, optionally filtered."""
    q = db.query(AuthEvent)
    if event_type:
        q = q.filter(AuthEvent.event_type == event_type)
    if user_id:
        q = q.filter(AuthEvent.user_id == user_id)
    return q.order_by(AuthEvent.created_at.desc()).limit(limit).all()
