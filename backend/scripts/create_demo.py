"""Create (or refresh) the shared demo user for the public demo deployment.

The demo account is logged into via the credential-free POST /auth/demo-login
(only enabled when HESTIA_DEMO_MODE=1), so it deliberately has NO word-key or
passkey — there's nothing to leak. It's identified by a stable id so the seed,
reset, and login paths all agree on which user it is.

Run against the demo DB (DB_DIR pointed at the demo data dir):
    HESTIA_DEMO_MODE=1 DB_DIR=/srv/hestia/demo/data/db \
        python -m scripts.create_demo

Idempotent: re-running just ensures the row exists with the right display name.
"""

import sys
from pathlib import Path

# Allow `python backend/scripts/create_demo.py` from project root too.
_backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_backend_dir))

from dotenv import load_dotenv
load_dotenv()

from auth import config
from database import SessionLocal, engine, ensure_schema_upgrades
from models import Base, User

DEMO_DISPLAY_NAME = "Demo Guest"


def ensure_demo_user(db) -> User:
    user = db.query(User).filter(User.id == config.DEMO_USER_ID).first()
    if user is None:
        user = User(id=config.DEMO_USER_ID, display_name=DEMO_DISPLAY_NAME, is_admin=False)
        db.add(user)
    else:
        user.display_name = DEMO_DISPLAY_NAME
        user.is_admin = False
    db.commit()
    db.refresh(user)
    return user


def main() -> int:
    Base.metadata.create_all(bind=engine)
    ensure_schema_upgrades()
    db = SessionLocal()
    try:
        user = ensure_demo_user(db)
        print(f"Demo user ready: {user.display_name} (id={user.id})")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
