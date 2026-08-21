"""Drafts are autosaved form state — incomplete by design, private by default."""

DRAFT_PAYLOAD = {
    "title": "Half-written Stew",
    "description": "",
    "yieldAmount": 4,
    "prepTime": "",
    "cookTime": "",
    "tags": ["soup"],
    "ingredients": [
        {"raw": "2 carrots", "qty": 2, "unit": "", "item": "carrots", "note": ""},
    ],
    "instructions": [{"text": "Chop the carrots"}],
    "importedUrl": "",
    "tabMode": "manual",
}


def _save(client, title="Half-written Stew", payload=None):
    return client.post(
        "/recipes/drafts/",
        json={"title": title, "payload": payload if payload is not None else DRAFT_PAYLOAD},
    )


def test_create_draft(client):
    r = _save(client)
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Half-written Stew"
    assert body["ingredient_count"] == 1
    assert body["instruction_count"] == 1
    assert body["payload"]["tags"] == ["soup"]
    assert body["id"]


def test_draft_may_be_incomplete(client):
    """A draft with no title and an empty form is still savable — that's the point."""
    r = client.post("/recipes/drafts/", json={"title": "  ", "payload": {}})
    assert r.status_code == 200
    assert r.json()["title"] is None
    assert r.json()["ingredient_count"] == 0


def test_list_drafts_newest_first(client):
    first = _save(client, title="Older").json()
    second = _save(client, title="Newer").json()
    # Edit the older one so it becomes the most recently updated.
    client.put(
        f"/recipes/drafts/{first['id']}",
        json={"title": "Older", "payload": {**DRAFT_PAYLOAD, "description": "now with a note"}},
    )

    r = client.get("/recipes/drafts/")
    assert r.status_code == 200
    ids = [d["id"] for d in r.json()]
    assert ids[0] == first["id"]
    assert second["id"] in ids
    # Summaries stay light — no payload on the list.
    assert "payload" not in r.json()[0]


def test_get_draft_round_trips_payload(client):
    created = _save(client).json()
    r = client.get(f"/recipes/drafts/{created['id']}")
    assert r.status_code == 200
    assert r.json()["payload"] == DRAFT_PAYLOAD


def test_update_draft(client):
    created = _save(client).json()
    changed = {**DRAFT_PAYLOAD, "title": "Renamed Stew", "instructions": []}
    r = client.put(
        f"/recipes/drafts/{created['id']}",
        json={"title": "Renamed Stew", "payload": changed},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Renamed Stew"
    assert r.json()["instruction_count"] == 0
    assert r.json()["id"] == created["id"]


def test_delete_draft(client):
    created = _save(client).json()
    assert client.delete(f"/recipes/drafts/{created['id']}").status_code == 200
    assert client.get(f"/recipes/drafts/{created['id']}").status_code == 404
    assert client.get("/recipes/drafts/").json() == []


def test_missing_draft_404s(client):
    assert client.get("/recipes/drafts/nope").status_code == 404
    assert client.put("/recipes/drafts/nope", json={"title": "x", "payload": {}}).status_code == 404
    assert client.delete("/recipes/drafts/nope").status_code == 404


def test_oversized_payload_rejected(client):
    r = client.post("/recipes/drafts/", json={"title": "Huge", "payload": {"blob": "x" * 300_000}})
    assert r.status_code == 413


def test_drafts_are_not_recipes(client):
    """A draft must never leak into the shared cookbook."""
    _save(client)
    assert client.get("/recipes/").json() == []


def test_drafts_path_not_shadowed_by_recipe_lookup(client):
    """/recipes/drafts must resolve to the drafts list, not /recipes/{recipe_id}."""
    r = client.get("/recipes/drafts/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
