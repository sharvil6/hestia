"""Reset the demo deployment back to its seeded state.

Wipes every recipe (and its annotations, via cascade), every tag, and the
recipe<->tag links, then re-seeds the placeholder recipes. The demo DB only ever
contains demo data, so a blanket wipe is safe — this is what makes the public
demo a sandbox visitors can freely poke at.

Wired to a daily systemd timer in prod (deploy/hestia-demo-reset.timer). Run
manually with:

    HESTIA_DEMO_MODE=1 DB_DIR=/srv/hestia/demo/data/db \
        UPLOAD_DIR=/srv/hestia/demo/data/uploads python -m scripts.reset_demo
"""

import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_backend_dir))

from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal, engine, ensure_schema_upgrades
from models import Annotation, Base, Recipe, RecipeTag, Tag
from scripts.seed_demo_recipes import seed_demo


def wipe(db) -> None:
    # Order matters under FK enforcement: link rows and annotations before recipes/tags.
    db.query(Annotation).delete()
    db.query(RecipeTag).delete()
    db.query(Recipe).delete()
    db.query(Tag).delete()
    db.commit()


def main() -> int:
    Base.metadata.create_all(bind=engine)
    ensure_schema_upgrades()
    db = SessionLocal()
    try:
        wipe(db)
        created = seed_demo(db)
        print(f"Demo reset complete: re-seeded {created} recipe(s).")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
