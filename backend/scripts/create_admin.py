"""Bootstrap the first admin user and print their 12-word key.

Run once on initial deploy:
    backend\\.venv\\Scripts\\Activate.ps1
    python -m scripts.create_admin "Sharvil"

The 12 words printed on stdout are the ONLY copy. Save them — there is no
recovery if they are lost (the hash is one-way).
"""

import argparse
import sys
from pathlib import Path

# Allow `python backend/scripts/create_admin.py "Name"` from project root too.
_backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_backend_dir))

# Honour the same .env that main.py reads so DB_DIR resolves to the same file
# regardless of whether you run this from project root or backend/.
from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal, engine, ensure_schema_upgrades
from models import AuthKey, Base, User
from auth import keys as keyutil


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap the first admin user.")
    parser.add_argument("display_name", help="Display name for the admin user (e.g. 'Sharvil')")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Create an additional admin even if one already exists.",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    ensure_schema_upgrades()
    db = SessionLocal()
    try:
        existing_admin = db.query(User).filter(User.is_admin.is_(True)).first()
        if existing_admin and not args.force:
            print(
                f"An admin already exists ({existing_admin.display_name}, id={existing_admin.id}). "
                "Use --force to add another, or issue an invite from the running app instead.",
                file=sys.stderr,
            )
            return 1

        user = User(display_name=args.display_name.strip(), is_admin=True)
        db.add(user)
        db.flush()

        raw_key = keyutil.generate_key()
        words = keyutil.key_to_words(raw_key)
        key_id = keyutil.derive_key_id(raw_key)
        db.add(AuthKey(user_id=user.id, key_id=key_id, key_hash=keyutil.hash_key(raw_key)))
        db.commit()

        print()
        print("=" * 60)
        print(f"Admin created: {user.display_name}  (id={user.id})")
        print("=" * 60)
        print()
        print("Your 12-word key (save these — this is the only copy):")
        print()
        for i in range(0, 12, 4):
            print("  " + "  ".join(f"{i+j+1:>2}. {words[i+j]}" for j in range(4)))
        print()
        print("QR payload:")
        print(f"  {keyutil.qr_payload(words)}")
        print()
        print("Sign in at /login by pasting the 12 words.")
        print("=" * 60)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
