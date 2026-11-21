"""GET /recipes/?updated_since= — incremental sync for external readers."""

import time
from datetime import datetime, timedelta, timezone

from tests.test_recipes import RECIPE_PAYLOAD


def _create(client, title, tags=("quick",)):
    r = client.post("/recipes/", json={**RECIPE_PAYLOAD, "title": title, "tags": list(tags)})
    assert r.status_code == 200, r.text
    return r.json()


def _since(client, ts, **params):
    r = client.get("/recipes/", params={"updated_since": ts, **params})
    assert r.status_code == 200, r.text
    return [x["title"] for x in r.json()]


def _tick():
    # updated_at has microsecond resolution; make ordering unambiguous.
    time.sleep(0.01)


def test_filters_to_recipes_changed_at_or_after_cursor(client):
    _create(client, "Old")
    _tick()
    new = _create(client, "New")
    assert _since(client, new["updated_at"]) == ["New"]
    assert sorted(_since(client, "2000-01-01T00:00:00")) == ["New", "Old"]


def test_no_param_returns_everything(client):
    _create(client, "A")
    _create(client, "B")
    assert {x["title"] for x in client.get("/recipes/").json()} == {"A", "B"}


def test_results_are_ordered_oldest_change_first_and_page(client):
    for t in ("One", "Two", "Three"):
        _create(client, t)
        _tick()
    assert _since(client, "2000-01-01T00:00:00") == ["One", "Two", "Three"]
    assert _since(client, "2000-01-01T00:00:00", skip=1, limit=1) == ["Two"]


def test_full_edit_bumps_updated_at(client):
    a = _create(client, "Edited")
    _tick()
    cursor = _create(client, "Marker")["updated_at"]
    _tick()
    r = client.put(f"/recipes/{a['id']}", json={**RECIPE_PAYLOAD, "title": "Edited v2"})
    assert r.status_code == 200
    assert _since(client, cursor) == ["Marker", "Edited v2"]


def test_tag_only_edit_bumps_updated_at(client):
    a = _create(client, "Tagged", tags=["quick"])
    _tick()
    cursor = _create(client, "Marker")["updated_at"]
    _tick()
    r = client.put(f"/recipes/{a['id']}", json={**RECIPE_PAYLOAD, "title": "Tagged", "tags": ["quick", "spicy"]})
    assert r.status_code == 200
    assert "Tagged" in _since(client, cursor)


def test_annotation_changes_bump_recipe(client):
    a = _create(client, "Annotated")
    _tick()
    cursor = _create(client, "Marker")["updated_at"]
    _tick()
    r = client.post(f"/recipes/{a['id']}/annotations", data={"content": "Less salt"})
    assert r.status_code == 200, r.text
    ann_id = r.json()["id"]
    assert "Annotated" in _since(client, cursor)

    cursor = client.get(f"/recipes/{a['id']}").json()["updated_at"]
    _tick()
    assert client.put(f"/recipes/annotations/{ann_id}", data={"content": "No salt"}).status_code == 200
    assert _since(client, cursor) == ["Annotated"]

    cursor = client.get(f"/recipes/{a['id']}").json()["updated_at"]
    _tick()
    assert client.delete(f"/recipes/annotations/{ann_id}").status_code == 200
    assert _since(client, cursor) == ["Annotated"]


def test_timezone_aware_cursor_is_converted_to_utc(client):
    _create(client, "Now")
    # One hour in the future expressed in UTC+05:00 — still in the future.
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).astimezone(timezone(timedelta(hours=5)))
    assert _since(client, future.isoformat()) == []
    # One hour ago expressed in UTC-08:00 — the recipe is newer than that.
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).astimezone(timezone(timedelta(hours=-8)))
    assert _since(client, past.isoformat()) == ["Now"]


def test_invalid_cursor_is_422(client):
    assert client.get("/recipes/", params={"updated_since": "yesterday"}).status_code == 422
