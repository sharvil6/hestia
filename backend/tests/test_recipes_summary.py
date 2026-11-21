"""GET /recipes/summary — compact, filterable list for planning agents."""

import time

import pytest

from auth.deps import get_current_user
from main import app
from tests.test_recipes import RECIPE_PAYLOAD


def _create(client, title, *, tags=(), prep=None, cook=None, description=None, ingredients=None):
    payload = {
        **RECIPE_PAYLOAD,
        "title": title,
        "tags": list(tags),
        "prep_time": prep,
        "cook_time": cook,
        "description": description,
    }
    if ingredients is not None:
        payload["ingredients"] = ingredients
    r = client.post("/recipes/", json=payload)
    assert r.status_code == 200, r.text
    time.sleep(0.01)  # keep updated_at ordering unambiguous
    return r.json()


def _summary(client, **params):
    r = client.get("/recipes/summary", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _titles(client, **params):
    return [x["title"] for x in _summary(client, **params)]


def test_shape_is_compact(client):
    created = _create(
        client, "Dal", tags=["Vegetarian", "weeknight"], prep=10, cook=25,
        ingredients=[
            {"qty": 1, "unit": "cup", "item": "red lentils", "note": "rinsed"},
            {"qty": 1, "unit": "tsp", "item": "  turmeric ", "note": ""},
            {"qty": 1, "unit": "", "item": "", "note": "blank row"},
        ],
    )
    [item] = _summary(client)
    assert item["id"] == created["id"]
    assert item["tags"] == ["vegetarian", "weeknight"]
    assert item["total_time"] == 35
    assert item["ingredients"] == ["red lentils", "turmeric"]
    assert "instructions" not in item and "annotations" not in item
    assert item["updated_at"] is not None


def test_total_time_with_partial_or_missing_times(client):
    _create(client, "Prep only", prep=15)
    _create(client, "No times")
    by_title = {x["title"]: x for x in _summary(client)}
    assert by_title["Prep only"]["total_time"] == 15
    assert by_title["No times"]["total_time"] is None


def test_long_description_is_truncated(client):
    _create(client, "Wordy", description="x" * 1000)
    [item] = _summary(client)
    assert len(item["description"]) == 280
    assert item["description"].endswith("…")


def test_tag_filter_requires_every_tag_case_insensitive(client):
    _create(client, "Both", tags=["vegetarian", "quick"])
    _create(client, "Veg only", tags=["vegetarian"])
    _create(client, "Neither", tags=["meat"])
    assert sorted(_titles(client, tag="Vegetarian")) == ["Both", "Veg only"]
    assert _titles(client, tag=["vegetarian", "QUICK"]) == ["Both"]
    assert _titles(client, tag="nonexistent") == []


def test_max_total_time(client):
    _create(client, "Fast", prep=5, cook=10)
    _create(client, "Slow", prep=30, cook=90)
    _create(client, "Unknown")
    assert _titles(client, max_total_time=15) == ["Fast"]
    assert sorted(_titles(client, max_total_time=500)) == ["Fast", "Slow"]


def test_text_search_on_title_and_description(client):
    _create(client, "Lentil Soup")
    _create(client, "Stew", description="Hearty lentil stew")
    _create(client, "Pancakes")
    assert sorted(_titles(client, q="lentil")) == ["Lentil Soup", "Stew"]


def test_filters_combine(client):
    _create(client, "Quick veg", tags=["vegetarian"], prep=5, cook=10)
    _create(client, "Slow veg", tags=["vegetarian"], prep=60, cook=60)
    _create(client, "Quick meat", tags=["meat"], prep=5, cook=10)
    assert _titles(client, tag="vegetarian", max_total_time=30) == ["Quick veg"]


def test_ordering_paging_and_updated_since(client):
    _create(client, "One")
    two = _create(client, "Two")
    _create(client, "Three")
    assert _titles(client) == ["One", "Two", "Three"]
    assert _titles(client, skip=1, limit=1) == ["Two"]
    assert _titles(client, updated_since=two["updated_at"]) == ["Two", "Three"]


def test_bad_params_are_422(client):
    assert client.get("/recipes/summary", params={"max_total_time": -1}).status_code == 422
    assert client.get("/recipes/summary", params={"limit": 0}).status_code == 422
    assert client.get("/recipes/summary", params={"updated_since": "soon"}).status_code == 422


def test_summary_route_is_not_shadowed_by_recipe_id(client):
    assert client.get("/recipes/summary").status_code == 200


@pytest.fixture
def real_auth(client):
    app.dependency_overrides.pop(get_current_user, None)
    return client


def test_read_only_api_token_can_use_summary(real_auth):
    from models import User
    app.dependency_overrides[get_current_user] = lambda: User(id="1", display_name="Mom")
    _create(real_auth, "Token visible", tags=["quick"])
    app.dependency_overrides.pop(get_current_user)

    tok = real_auth.post("/auth/api-tokens", json={"name": "Muse"}).json()["token"]
    r = real_auth.get("/recipes/summary", params={"tag": "quick"}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert [x["title"] for x in r.json()] == ["Token visible"]
