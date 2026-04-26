from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import logging

import os
import uuid
import shutil
import models, schemas
from database import get_db

logger = logging.getLogger("hestia.recipes")

router = APIRouter(prefix="/recipes", tags=["Recipes"])

@router.get("/", response_model=List[schemas.RecipeResponse])
def read_recipes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    recipes = db.query(models.Recipe).offset(skip).limit(limit).all()
    return recipes

@router.get("/{recipe_id}", response_model=schemas.RecipeResponse)
def read_recipe(recipe_id: str, db: Session = Depends(get_db)):
    recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe

@router.post("/", response_model=schemas.RecipeResponse)
def create_recipe(recipe: schemas.RecipeCreate, db: Session = Depends(get_db)):
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
    
    # Look up or create tags
    for tag_name in recipe.tags:
        tag_name = tag_name.strip()
        if not tag_name:
            continue
        tag = db.query(models.Tag).filter(models.Tag.name == tag_name).first()
        if not tag:
            tag = models.Tag(name=tag_name)
            db.add(tag)
        db_recipe.tags.append(tag)
    
    db.add(db_recipe)
    db.commit()
    db.refresh(db_recipe)
    return db_recipe

@router.delete("/{recipe_id}")
def delete_recipe(recipe_id: str, db: Session = Depends(get_db)):
    recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    db.delete(recipe)
    db.commit()
    return {"ok": True}

@router.put("/{recipe_id}", response_model=schemas.RecipeResponse)
def update_recipe(recipe_id: str, recipe: schemas.RecipeCreate, db: Session = Depends(get_db)):
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
    
    # Update tags
    db_recipe.tags = []
    for tag_name in recipe.tags:
        tag_name = tag_name.strip()
        if not tag_name:
            continue
        tag = db.query(models.Tag).filter(models.Tag.name == tag_name).first()
        if not tag:
            tag = models.Tag(name=tag_name)
            db.add(tag)
        db_recipe.tags.append(tag)
        
    db.commit()
    db.refresh(db_recipe)
    return db_recipe


from fastapi import UploadFile, File, Form
from services.vision import extract_recipe_from_image
from services.scraper import scrape_recipe_from_url
from sqlalchemy import text
try:
    from recipe_scrapers.exceptions import NoSchemaFoundInWildMode
except ImportError:
    NoSchemaFoundInWildMode = Exception

@router.post("/scrape/preview", response_model=schemas.RecipeCreate)
def preview_scrape(url: str = Form(...)):
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
def ingest_from_scraper(url: str = Form(...), db: Session = Depends(get_db)):
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
async def preview_vision(file: UploadFile = File(...)):
    """Extract a recipe from an image and return it for client-side review, without saving."""
    logger.info("Vision preview requested for file: %s (%s)", file.filename, file.content_type)
    try:
        contents = await file.read()
        recipe_schema = extract_recipe_from_image(contents)
        logger.info("Vision preview succeeded: %s", recipe_schema.title)
        return recipe_schema
    except Exception as e:
        logger.exception("Vision preview failed")
        raise HTTPException(status_code=422, detail=f"Failed to extract recipe from image: {str(e)}")

@router.post("/ingest/image", response_model=schemas.RecipeResponse)
async def ingest_from_vision(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    recipe_schema = extract_recipe_from_image(contents)
    return create_recipe(recipe_schema, db)

@router.get("/search/fts", response_model=List[schemas.RecipeResponse])
def search_recipes(q: str, db: Session = Depends(get_db)):
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
    image: UploadFile = File(...)
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
    db: Session = Depends(get_db)
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
        user_id=user_id,
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
    db: Session = Depends(get_db)
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
def delete_recipe_annotation(annotation_id: str, db: Session = Depends(get_db)):
    annotation = db.query(models.Annotation).filter(models.Annotation.id == annotation_id).first()
    if annotation is None:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    db.delete(annotation)
    db.commit()
    return {"ok": True}
