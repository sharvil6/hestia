"""Autosaved, in-progress recipes.

The add-recipe form saves itself here every few seconds so a half-entered recipe
survives a closed tab, a stray navigation, or a second device. Drafts are private
to their author and never appear in the shared cookbook — they only become a
Recipe when the user explicitly saves.

Mounted before the recipes router in main.py so that `/recipes/drafts` is matched
literally instead of being swallowed by `/recipes/{recipe_id}`.
"""

import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models, schemas
from auth.deps import get_current_user
from database import get_db

logger = logging.getLogger("hestia.drafts")

router = APIRouter(prefix="/recipes/drafts", tags=["Drafts"])

# A draft is form state, not an upload target. Step photos are stored as paths
# (uploaded separately), so anything near this size is a client bug or abuse.
MAX_PAYLOAD_BYTES = 256 * 1024

# One user hoarding drafts would make the list unusable long before this, but a
# ceiling keeps a looping client from filling the disk.
MAX_DRAFTS_PER_USER = 100


def _counts(payload: dict) -> tuple[int, int]:
    """(ingredients, instructions) as stored in the payload, defensively — the
    payload is client-shaped and may predate any given field."""
    def size(key: str) -> int:
        value = (payload or {}).get(key)
        return len(value) if isinstance(value, list) else 0
    return size("ingredients"), size("instructions")


def _to_response(draft: models.RecipeDraft) -> schemas.RecipeDraftResponse:
    ingredients, instructions = _counts(draft.payload)
    return schemas.RecipeDraftResponse(
        id=draft.id,
        title=draft.title,
        payload=draft.payload or {},
        ingredient_count=ingredients,
        instruction_count=instructions,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


def _owned_draft(draft_id: str, db: Session, user) -> models.RecipeDraft:
    """Fetch a draft or 404. Someone else's draft is reported as missing rather
    than forbidden — a draft's existence is itself private."""
    draft = (
        db.query(models.RecipeDraft)
        .filter(
            models.RecipeDraft.id == draft_id,
            models.RecipeDraft.user_id == user.id,
        )
        .first()
    )
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


def _validate_payload(payload: dict) -> None:
    if len(json.dumps(payload or {})) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Draft is too large to save.")


def _clean_title(title: str | None) -> str | None:
    title = (title or "").strip()
    return title[:200] or None


@router.get("/", response_model=List[schemas.RecipeDraftSummary])
def list_drafts(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """The current user's drafts, most recently touched first."""
    drafts = (
        db.query(models.RecipeDraft)
        .filter(models.RecipeDraft.user_id == user.id)
        .order_by(models.RecipeDraft.updated_at.desc())
        .all()
    )
    return [_to_response(d) for d in drafts]


@router.post("/", response_model=schemas.RecipeDraftResponse)
def create_draft(
    body: schemas.RecipeDraftSave,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _validate_payload(body.payload)
    existing = (
        db.query(models.RecipeDraft)
        .filter(models.RecipeDraft.user_id == user.id)
        .count()
    )
    if existing >= MAX_DRAFTS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail="You have too many saved drafts. Delete a few and try again.",
        )
    draft = models.RecipeDraft(
        user_id=user.id,
        title=_clean_title(body.title),
        payload=body.payload or {},
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return _to_response(draft)


@router.get("/{draft_id}", response_model=schemas.RecipeDraftResponse)
def read_draft(draft_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _to_response(_owned_draft(draft_id, db, user))


@router.put("/{draft_id}", response_model=schemas.RecipeDraftResponse)
def update_draft(
    draft_id: str,
    body: schemas.RecipeDraftSave,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _validate_payload(body.payload)
    draft = _owned_draft(draft_id, db, user)
    draft.title = _clean_title(body.title)
    draft.payload = body.payload or {}
    db.commit()
    db.refresh(draft)
    return _to_response(draft)


@router.delete("/{draft_id}")
def delete_draft(draft_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    draft = _owned_draft(draft_id, db, user)
    db.delete(draft)
    db.commit()
    return {"ok": True}
