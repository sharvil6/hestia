from datetime import timedelta, date
from typing import List
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models, schemas
from database import get_db
from auth.deps import get_current_user
from services.grocery import sync_grocery_items

logger = logging.getLogger("hestia.plans")

router = APIRouter(prefix="/plans", tags=["Meal Plans"])


def _snap_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _load_plan(db: Session, plan_id: str, user: models.User, owner_only: bool = False) -> models.MealPlan:
    """Fetch a plan and enforce access: owner or member; owner_only for
    membership management and deletion. 404 hides existence from strangers."""
    plan = db.query(models.MealPlan).filter(models.MealPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    is_owner = plan.created_by == user.id
    is_member = any(m.id == user.id for m in plan.members)
    if not (is_owner or is_member):
        raise HTTPException(status_code=404, detail="Meal plan not found")
    if owner_only and not is_owner:
        raise HTTPException(status_code=403, detail="Only the plan owner can do this")
    return plan


def _resolve_members(db: Session, user_ids: List[str], owner_id: str) -> List[models.User]:
    """Dedupe, drop the owner (owner is implicit), and keep only real users."""
    seen = set()
    users = []
    for uid in user_ids:
        if not uid or uid == owner_id or uid in seen:
            continue
        seen.add(uid)
        u = db.query(models.User).filter(models.User.id == uid).first()
        if u is not None:
            users.append(u)
    return users


@router.get("/", response_model=List[schemas.MealPlanSummary])
def list_plans(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plans = (
        db.query(models.MealPlan)
        .outerjoin(models.MealPlanMember, models.MealPlanMember.plan_id == models.MealPlan.id)
        .filter(
            (models.MealPlan.created_by == user.id)
            | (models.MealPlanMember.user_id == user.id)
        )
        .order_by(models.MealPlan.week_start.desc())
        .distinct()
        .all()
    )
    return plans


@router.post("/", response_model=schemas.MealPlanDetail)
def create_plan(payload: schemas.MealPlanCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = models.MealPlan(
        name=(payload.name or "").strip() or None,
        week_start=_snap_monday(payload.week_start),
        created_by=user.id,
    )
    plan.members = _resolve_members(db, payload.member_ids, user.id)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=schemas.MealPlanDetail)
def read_plan(plan_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return _load_plan(db, plan_id, user)


@router.patch("/{plan_id}", response_model=schemas.MealPlanDetail)
def update_plan(plan_id: str, payload: schemas.MealPlanUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user)
    if payload.name is not None:
        plan.name = payload.name.strip() or None
    if payload.week_start is not None:
        plan.week_start = _snap_monday(payload.week_start)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}")
def delete_plan(plan_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user, owner_only=True)
    db.delete(plan)
    db.commit()
    return {"ok": True}


@router.put("/{plan_id}/members", response_model=schemas.MealPlanDetail)
def set_members(plan_id: str, payload: schemas.MemberSet, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user, owner_only=True)
    plan.members = _resolve_members(db, payload.user_ids, plan.created_by)
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/{plan_id}/entries", response_model=schemas.MealPlanDetail)
def add_entry(plan_id: str, payload: schemas.EntryCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user)
    recipe = db.query(models.Recipe).filter(models.Recipe.id == payload.recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    siblings = [e for e in plan.entries if e.day == payload.day and e.slot == payload.slot]
    entry = models.MealPlanEntry(
        plan_id=plan.id,
        day=payload.day,
        slot=payload.slot,
        recipe_id=recipe.id,
        position=max((e.position for e in siblings), default=-1) + 1,
        scale=payload.scale,
    )
    db.add(entry)
    db.flush()
    db.refresh(plan)
    sync_grocery_items(db, plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.patch("/{plan_id}/entries/{entry_id}", response_model=schemas.MealPlanDetail)
def update_entry(plan_id: str, entry_id: str, payload: schemas.EntryUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Change an entry's batch scale (double/triple the recipe); the grocery
    list re-syncs to the new quantities."""
    plan = _load_plan(db, plan_id, user)
    entry = next((e for e in plan.entries if e.id == entry_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.scale = payload.scale
    db.flush()
    sync_grocery_items(db, plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}/entries/{entry_id}", response_model=schemas.MealPlanDetail)
def delete_entry(plan_id: str, entry_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user)
    entry = next((e for e in plan.entries if e.id == entry_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    plan.entries.remove(entry)  # delete-orphan cascade removes the row
    db.flush()
    sync_grocery_items(db, plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/{plan_id}/grocery", response_model=schemas.GroceryItemResponse)
def add_grocery_item(plan_id: str, payload: schemas.GroceryItemCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user)
    label = payload.item.strip()
    if not label:
        raise HTTPException(status_code=422, detail="Item label is required")
    item = models.GroceryItem(
        plan_id=plan.id,
        item=label,
        # Manual rows never merge, but give them a unique key so they can't
        # collide with an auto row's key.
        key=f"manual|{secrets.token_urlsafe(8)}",
        qty=payload.qty,
        unit=payload.unit.strip(),
        checked=False,
        is_manual=True,
        position=max((g.position for g in plan.grocery_items), default=-1) + 1,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{plan_id}/grocery/{item_id}", response_model=schemas.GroceryItemResponse)
def update_grocery_item(plan_id: str, item_id: str, payload: schemas.GroceryItemUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user)
    item = next((g for g in plan.grocery_items if g.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Grocery item not found")
    if payload.checked is not None:
        item.checked = payload.checked
    if item.is_manual:
        if payload.item is not None and payload.item.strip():
            item.item = payload.item.strip()
        if payload.qty is not None:
            item.qty = payload.qty
        if payload.unit is not None:
            item.unit = payload.unit.strip()
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{plan_id}/grocery/{item_id}")
def delete_grocery_item(plan_id: str, item_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    plan = _load_plan(db, plan_id, user)
    item = next((g for g in plan.grocery_items if g.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Grocery item not found")
    if not item.is_manual:
        # An auto row would just come back on the next sync; unchecking is the
        # way to "keep it but not need it".
        raise HTTPException(status_code=422, detail="Only manually added items can be deleted")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{plan_id}/grocery/regenerate", response_model=schemas.MealPlanDetail)
def regenerate_grocery(plan_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Re-derive auto rows from the planned recipes — for when a recipe's
    ingredients changed after it was added to the plan."""
    plan = _load_plan(db, plan_id, user)
    sync_grocery_items(db, plan)
    db.commit()
    db.refresh(plan)
    return plan
