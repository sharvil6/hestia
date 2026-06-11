from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from database import get_db
from auth.deps import get_current_user

router = APIRouter(prefix="/tags", tags=["Tags"])


@router.get("/", response_model=List[schemas.TagResponse])
def list_tags(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """All known tags, alphabetized — used to power tag autocomplete suggestions."""
    return db.query(models.Tag).order_by(models.Tag.name).all()
