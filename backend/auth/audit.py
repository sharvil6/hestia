"""Authentication audit trail.

Records one row per auth action (login, logout, failed attempt, enroll, key
rotation) with the who / when / where. "Where" is derived from Cloudflare's edge
headers, which is the only place the real client IP and country survive in
production — the app sits behind a Cloudflare Tunnel, so `request.client.host`
is always 127.0.0.1 there.

Recording is best-effort: a failure here must never break the auth flow that
triggered it, so `record_event` swallows and logs its own errors.
"""

import logging
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session as DBSession

from models import AuthEvent, User

logger = logging.getLogger("hestia.audit")


def client_ip(request: Request) -> Optional[str]:
    """Best-guess originating client IP.

    Order: Cloudflare's `CF-Connecting-IP` (authoritative behind the tunnel) →
    the first hop of `X-Forwarded-For` → the direct socket peer. In local dev
    none of the proxy headers are present, so this yields 127.0.0.1.
    """
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # Left-most entry is the original client; the rest are proxies.
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def client_country(request: Request) -> Optional[str]:
    """ISO 3166-1 alpha-2 country code from Cloudflare, or None locally.

    Cloudflare uses "XX" for unknown and "T1" for Tor; both are treated as
    "unknown" (None) so the UI doesn't try to render them as a flag.
    """
    country = request.headers.get("cf-ipcountry")
    if not country or country in {"XX", "T1"}:
        return None
    return country.strip().upper()


def record_event(
    db: DBSession,
    request: Request,
    *,
    event_type: str,
    user: Optional[User] = None,
    display_name: Optional[str] = None,
    auth_method: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    """Append an auth event. Best-effort — never raises."""
    try:
        event = AuthEvent(
            event_type=event_type,
            user_id=user.id if user else None,
            display_name=display_name or (user.display_name if user else None),
            auth_method=auth_method,
            ip=client_ip(request),
            country=client_country(request),
            user_agent=request.headers.get("user-agent"),
            detail=detail,
        )
        db.add(event)
        db.commit()
    except Exception:
        logger.warning("failed to record auth event %s", event_type, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass
