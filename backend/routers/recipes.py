from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

import os
import uuid
import secrets
import shutil
import models, schemas
from database import get_db
from auth.deps import get_current_user
from services.grocery import sync_grocery_items

logger = logging.getLogger("hestia.recipes")

router = APIRouter(prefix="/recipes", tags=["Recipes"])


def resolve_tags(db: Session, tag_names: List[str]) -> List["models.Tag"]:
    """Normalize tag names (trim + lowercase), de-duplicate, and map each to an
    existing Tag row or a freshly created one. Tags are always stored lowercase."""
    resolved = []
    seen = set()
    for raw in tag_names:
        name = (raw or "").strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        tag = db.query(models.Tag).filter(models.Tag.name == name).first()
        if not tag:
            tag = models.Tag(name=name)
            db.add(tag)
        resolved.append(tag)
    return resolved


@router.get("/", response_model=List[schemas.RecipeResponse])
def read_recipes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    recipes = db.query(models.Recipe).offset(skip).limit(limit).all()
    return recipes

@router.get("/public/{share_token}", response_model=schemas.PublicRecipeResponse)
def read_public_recipe(share_token: str, db: Session = Depends(get_db)):
    """Unauthenticated read of a shared recipe. The only un-gated recipe endpoint:
    access is by possession of the unguessable share token. Private comments are
    never returned."""
    recipe = (
        db.query(models.Recipe)
        .filter(models.Recipe.share_token == share_token)
        .first()
    )
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    payload = schemas.PublicRecipeResponse.model_validate(recipe)
    payload.annotations = [
        schemas.PublicAnnotation.model_validate(a)
        for a in recipe.annotations
        if not a.is_private
    ]
    return payload


@router.get("/{recipe_id}", response_model=schemas.RecipeResponse)
def read_recipe(recipe_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.post("/{recipe_id}/share", response_model=schemas.ShareResponse)
def share_recipe(recipe_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Enable public sharing, minting a token if one doesn't exist yet. Idempotent:
    re-sharing an already-shared recipe returns the existing token (the live link
    keeps working)."""
    recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if not recipe.share_token:
        recipe.share_token = secrets.token_urlsafe(16)
        db.commit()
        db.refresh(recipe)
    return schemas.ShareResponse(share_token=recipe.share_token)


@router.delete("/{recipe_id}/share", response_model=schemas.ShareResponse)
def unshare_recipe(recipe_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Revoke the public link. The old token is discarded, so any previously
    shared URL 404s immediately; re-sharing later mints a fresh token."""
    recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe.share_token = None
    db.commit()
    return schemas.ShareResponse(share_token=None)

@router.post("/", response_model=schemas.RecipeResponse)
def create_recipe(recipe: schemas.RecipeCreate, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    db_recipe = models.Recipe(
        title=recipe.title,
        description=recipe.description,
        cover_image=recipe.cover_image,
        original_yield=recipe.original_yield,
        prep_time=recipe.prep_time,
        cook_time=recipe.cook_time,
        source_url=recipe.source_url,
        ingredients=[ing.model_dump() for ing in recipe.ingredients],
        instructions=[inst.model_dump() for inst in recipe.instructions]
    )
    
    # Look up or create tags (normalized to lowercase)
    db_recipe.tags = resolve_tags(db, recipe.tags)

    db.add(db_recipe)
    db.commit()
    db.refresh(db_recipe)
    return db_recipe

@router.delete("/{recipe_id}")
def delete_recipe(recipe_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    # Meal-plan entries referencing this recipe cascade away at the DB level;
    # remember which plans were affected so their grocery lists can re-sync.
    affected_plan_ids = [
        row[0]
        for row in db.query(models.MealPlanEntry.plan_id)
        .filter(models.MealPlanEntry.recipe_id == recipe_id)
        .distinct()
        .all()
    ]
    db.delete(recipe)
    db.flush()
    db.expire_all()  # entry rows were removed by FK cascade behind the ORM's back
    for plan_id in affected_plan_ids:
        plan = db.query(models.MealPlan).filter(models.MealPlan.id == plan_id).first()
        if plan is not None:
            sync_grocery_items(db, plan)
    db.commit()
    return {"ok": True}

@router.put("/{recipe_id}", response_model=schemas.RecipeResponse)
def update_recipe(recipe_id: str, recipe: schemas.RecipeCreate, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    db_recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if db_recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    db_recipe.title = recipe.title
    db_recipe.description = recipe.description
    db_recipe.cover_image = recipe.cover_image
    db_recipe.original_yield = recipe.original_yield
    db_recipe.prep_time = recipe.prep_time
    db_recipe.cook_time = recipe.cook_time
    db_recipe.source_url = recipe.source_url
    db_recipe.ingredients = [ing.model_dump() for ing in recipe.ingredients]
    db_recipe.instructions = [inst.model_dump() for inst in recipe.instructions]
    
    # Update tags (normalized to lowercase)
    db_recipe.tags = resolve_tags(db, recipe.tags)

    db.commit()
    db.refresh(db_recipe)
    return db_recipe


from fastapi import UploadFile, File, Form
from services.vision import extract_recipe_from_image
from services.scraper import scrape_recipe_from_url
from sqlalchemy import text
from auth import config as auth_config


def _guard_demo_llm() -> None:
    """In demo mode the Gemini-vision paths are off — there's no API key on the
    demo box and we don't want anonymous visitors burning quota. Manual add and
    URL scrape (no LLM) stay available."""
    if auth_config.DEMO_MODE:
        raise HTTPException(status_code=403, detail="AI extraction is disabled in the demo.")
try:
    from recipe_scrapers.exceptions import NoSchemaFoundInWildMode
except ImportError:
    NoSchemaFoundInWildMode = Exception

@router.post("/scrape/preview", response_model=schemas.RecipeCreate)
def preview_scrape(url: str = Form(...), _user=Depends(get_current_user)):
    """Scrape a URL and return the parsed recipe for client-side review, without saving."""
    logger.info("Preview scrape requested for URL: %s", url)
    try:
        recipe_schema = scrape_recipe_from_url(url)
        logger.info("Preview scrape succeeded: %s", recipe_schema.title)
        return recipe_schema
    except NoSchemaFoundInWildMode:
        logger.warning("No schema found in wild mode for URL: %s", url)
        raise HTTPException(
            status_code=422,
            detail="No recipe schema found on this page. The site may not use standard recipe markup."
        )
    except Exception as e:
        logger.exception("Scrape failed for URL: %s", url)
        raise HTTPException(status_code=422, detail=f"Failed to scrape recipe: {str(e)}")

@router.post("/ingest/url", response_model=schemas.RecipeResponse)
def ingest_from_scraper(url: str = Form(...), db: Session = Depends(get_db), _user=Depends(get_current_user)):
    logger.info("Ingest from URL requested: %s", url)
    try:
        recipe_schema = scrape_recipe_from_url(url)
        logger.info("Ingest scrape succeeded: %s", recipe_schema.title)
        return create_recipe(recipe_schema, db)
    except NoSchemaFoundInWildMode:
        logger.warning("No schema found in wild mode for URL: %s", url)
        raise HTTPException(
            status_code=422,
            detail="No recipe schema found on this page. The site may not use standard recipe markup."
        )
    except Exception as e:
        logger.exception("Ingest failed for URL: %s", url)
        raise HTTPException(status_code=422, detail=f"Failed to scrape recipe: {str(e)}")

@router.post("/vision/preview", response_model=schemas.RecipeCreate)
async def preview_vision(
    files: List[UploadFile] = File(default=[]),
    file: Optional[UploadFile] = File(default=None),
    _user=Depends(get_current_user),
):
    """Extract a recipe from one or more page images and return it for client-side
    review, without saving. The web client sends multiple `files` (Page 1, Page 2, …)
    that are consolidated into a single recipe; older clients (mobile) send one `file`."""
    _guard_demo_llm()
    uploads = list(files)
    if file is not None:
        uploads.append(file)
    if not uploads:
        raise HTTPException(status_code=422, detail="No image provided.")
    logger.info(
        "Vision preview requested for %d page(s): %s",
        len(uploads), [u.filename for u in uploads],
    )
    try:
        contents = [await u.read() for u in uploads]
        recipe_schema = extract_recipe_from_image(contents)
        logger.info("Vision preview succeeded: %s", recipe_schema.title)
        return recipe_schema
    except Exception as e:
        logger.exception("Vision preview failed")
        raise HTTPException(status_code=422, detail=f"Failed to extract recipe from image: {str(e)}")

@router.post("/ingest/image", response_model=schemas.RecipeResponse)
async def ingest_from_vision(file: UploadFile = File(...), db: Session = Depends(get_db), _user=Depends(get_current_user)):
    _guard_demo_llm()
    contents = await file.read()
    recipe_schema = extract_recipe_from_image(contents)
    return create_recipe(recipe_schema, db)

@router.get("/search/fts", response_model=List[schemas.RecipeResponse])
def search_recipes(q: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    recipes = db.query(models.Recipe).filter(
        models.Recipe.title.ilike(f"%{q}%") | models.Recipe.description.ilike(f"%{q}%")
    ).all()
    return recipes

UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads"))
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

from typing import Optional

@router.post("/upload-image")
def upload_recipe_image(
    image: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    if not image or not image.filename:
        raise HTTPException(status_code=400, detail="No image file provided")
    
    ext = os.path.splitext(image.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)
    
    return {"url": f"/images/{filename}"}

@router.post("/{recipe_id}/annotations", response_model=schemas.AnnotationResponse)
def add_recipe_annotation(
    recipe_id: str,
    content: str = Form(...),
    step_index: Optional[int] = Form(None),
    image: Optional[UploadFile] = File(None),
    user_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    image_path = None
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_path = f"/images/{filename}"
        
    db_annotation = models.Annotation(
        recipe_id=recipe_id,
        user_id=user_id or current_user.id,
        step_index=step_index,
        content=content,
        image_path=image_path
    )
    
    db.add(db_annotation)
    db.commit()
    db.refresh(db_annotation)
    return db_annotation

@router.put("/annotations/{annotation_id}", response_model=schemas.AnnotationResponse)
def update_recipe_annotation(
    annotation_id: str,
    content: str = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    annotation = db.query(models.Annotation).filter(models.Annotation.id == annotation_id).first()
    if annotation is None:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    if content is not None:
        annotation.content = content

    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        annotation.image_path = f"/images/{filename}"
        
    db.commit()
    db.refresh(annotation)
    return annotation

@router.delete("/annotations/{annotation_id}")
def delete_recipe_annotation(annotation_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    annotation = db.query(models.Annotation).filter(models.Annotation.id == annotation_id).first()
    if annotation is None:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    db.delete(annotation)
    db.commit()
    return {"ok": True}
