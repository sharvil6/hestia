"""Grocery-list aggregation for meal plans.

Auto-generated grocery rows are derived from the ingredients of every recipe
planned in a MealPlan. Rows merge on a normalized "item|unit" key: same
ingredient in the same unit sums its quantities; a different unit gets its own
row. Regeneration reconciles against existing rows by key so a member's
checked state survives plan edits. Manual rows are never touched.
"""
import re

from sqlalchemy.orm import Session

import models


def _norm(text: str) -> str:
    """Lowercase and collapse whitespace for stable merge keys."""
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def merge_key(item: str, unit: str) -> str:
    return f"{_norm(item)}|{_norm(unit)}"


def aggregate_ingredients(scaled_recipes: list[tuple["models.Recipe", float]]) -> dict[str, dict]:
    """Merge the structured ingredients ({qty, unit, item, note}) of the given
    (recipe, scale) pairs, multiplying quantities by each placement's scale
    (2.0 = doubled batch). Returns {merge_key: {"item", "unit", "qty"}}
    preserving first-seen display casing; qty is None if no occurrence carried
    a usable quantity."""
    merged: dict[str, dict] = {}
    for recipe, scale in scaled_recipes:
        for ing in (recipe.ingredients or []):
            item = (ing.get("item") or "").strip()
            if not item:
                continue
            unit = (ing.get("unit") or "").strip()
            key = merge_key(item, unit)
            try:
                qty = float(ing.get("qty")) * scale if ing.get("qty") is not None else None
            except (TypeError, ValueError):
                qty = None
            if key in merged:
                existing = merged[key]
                if qty is not None:
                    existing["qty"] = (existing["qty"] or 0) + qty
            else:
                merged[key] = {"item": item, "unit": unit, "qty": qty}
    return merged


def sync_grocery_items(db: Session, plan: "models.MealPlan") -> None:
    """Reconcile the plan's auto grocery rows against its current entries.

    - key still present: update qty/unit label, keep checked state
    - key gone: delete the row
    - new key: insert unchecked at the end

    Manual rows are left alone. Does not commit — callers own the transaction.
    """
    scaled = [(e.recipe, e.scale or 1.0) for e in plan.entries if e.recipe is not None]
    desired = aggregate_ingredients(scaled)

    auto_rows = [g for g in plan.grocery_items if not g.is_manual]
    existing_by_key = {g.key: g for g in auto_rows}

    for key, row in existing_by_key.items():
        if key not in desired:
            db.delete(row)

    max_pos = max((g.position for g in plan.grocery_items), default=-1)
    for key, want in desired.items():
        row = existing_by_key.get(key)
        if row is not None:
            row.qty = want["qty"]
            row.item = want["item"]
            row.unit = want["unit"]
        else:
            max_pos += 1
            db.add(models.GroceryItem(
                plan_id=plan.id,
                item=want["item"],
                key=key,
                qty=want["qty"],
                unit=want["unit"],
                checked=False,
                is_manual=False,
                position=max_pos,
            ))
