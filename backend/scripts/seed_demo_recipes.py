"""Seed the demo deployment's DB with placeholder recipes.

Runs against the demo DB (DB_DIR) and writes generated cover images into the
demo UPLOAD_DIR. Idempotent: recipes use deterministic ids (``demo-<slug>``) so
re-running skips ones that already exist.

    HESTIA_DEMO_MODE=1 DB_DIR=/srv/hestia/demo/data/db \
        UPLOAD_DIR=/srv/hestia/demo/data/uploads python -m scripts.seed_demo_recipes

The cover images are generated locally with Pillow (already a backend dep via the
vision service), so there are no binary fixtures committed to the repo.
"""

import json
import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_backend_dir))

from dotenv import load_dotenv
load_dotenv()

import os

from database import SessionLocal, engine, ensure_schema_upgrades
from models import Base, Recipe, Tag
from scripts.create_demo import ensure_demo_user

_FIXTURES = Path(__file__).resolve().parent / "demo_fixtures" / "recipes.json"

UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    str(_backend_dir.parent / "data" / "uploads"),
)


def _resolve_tags(db, tag_names, cache):
    """Trim + lowercase + de-dupe tag names, reusing existing Tag rows.
    Mirrors routers.recipes.resolve_tags, but with an in-memory `cache` so a tag
    shared across several fixtures isn't inserted twice in the same (unflushed)
    transaction — autoflush is off, so a DB query wouldn't see pending adds."""
    resolved = []
    seen = set()
    for raw in tag_names:
        name = (raw or "").strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        tag = cache.get(name)
        if tag is None:
            tag = db.query(Tag).filter(Tag.name == name).first()
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
        cache[name] = tag
        resolved.append(tag)
    return resolved


def _generate_cover(slug: str, title: str, color: str) -> str:
    """Render a simple coloured cover card with the title and return its
    /images/... URL. Overwrites any existing file with the same stable name."""
    from PIL import Image, ImageDraw, ImageFont

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    W, H = 800, 500
    img = Image.new("RGB", (W, H), color)
    draw = ImageDraw.Draw(img)

    # Subtle darker band along the bottom for the title to sit on.
    band_top = int(H * 0.68)
    draw.rectangle([0, band_top, W, H], fill=(0, 0, 0))
    band = Image.new("RGB", (W, H - band_top), color)
    img.paste(Image.blend(band, Image.new("RGB", band.size, (0, 0, 0)), 0.45), (0, band_top))

    def _font(size: int):
        for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "Arial.ttf", "arial.ttf"):
            try:
                return ImageFont.truetype(name, size)
            except Exception:
                continue
        try:
            return ImageFont.load_default(size=size)  # Pillow >= 10.1
        except TypeError:
            return ImageFont.load_default()

    font = _font(44)
    # Word-wrap the title to fit the width.
    words = title.split()
    lines, line = [], ""
    for w in words:
        trial = (line + " " + w).strip()
        if draw.textlength(trial, font=font) <= W - 80:
            line = trial
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)

    y = band_top + 28
    for ln in lines:
        draw.text((40, y), ln, fill=(255, 255, 255), font=font)
        bbox = draw.textbbox((0, 0), ln, font=font)
        y += (bbox[3] - bbox[1]) + 10

    filename = f"demo-{slug}.jpg"
    img.save(os.path.join(UPLOAD_DIR, filename), "JPEG", quality=88)
    return f"/images/{filename}"


def seed_demo(db) -> int:
    """Insert any missing demo recipes. Returns the number created."""
    demo_user = ensure_demo_user(db)
    fixtures = json.loads(_FIXTURES.read_text(encoding="utf-8"))
    tag_cache: dict = {}
    created = 0
    for fx in fixtures:
        recipe_id = f"demo-{fx['slug']}"
        if db.query(Recipe).filter(Recipe.id == recipe_id).first() is not None:
            continue
        cover = _generate_cover(fx["slug"], fx["title"], fx.get("color", "#8A9A5B"))
        recipe = Recipe(
            id=recipe_id,
            title=fx["title"],
            description=fx.get("description"),
            cover_image=cover,
            original_yield=fx.get("original_yield"),
            prep_time=fx.get("prep_time"),
            cook_time=fx.get("cook_time"),
            source_url=None,
            created_by=demo_user.id,
            ingredients=fx.get("ingredients", []),
            instructions=fx.get("instructions", []),
        )
        recipe.tags = _resolve_tags(db, fx.get("tags", []), tag_cache)
        db.add(recipe)
        created += 1
    db.commit()
    return created


def main() -> int:
    Base.metadata.create_all(bind=engine)
    ensure_schema_upgrades()
    db = SessionLocal()
    try:
        created = seed_demo(db)
        total = db.query(Recipe).count()
        print(f"Seeded {created} new demo recipe(s); {total} total in demo DB.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
