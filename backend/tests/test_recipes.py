import pytest

RECIPE_PAYLOAD = {
    "title": "Test Pasta",
    "description": "A simple pasta dish",
    "original_yield": 4,
    "prep_time": 10,
    "cook_time": 20,
    "ingredients": [
        {"qty": 200.0, "unit": "g", "item": "pasta", "note": ""},
    ],
    "instructions": [
        {"step_number": 1, "text": "Boil water"},
        {"step_number": 2, "text": "Cook pasta"},
    ],
    "tags": ["italian", "quick"],
}


def test_create_recipe(client):
    r = client.post("/recipes/", json=RECIPE_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Test Pasta"
    assert body["description"] == "A simple pasta dish"
    assert len(body["ingredients"]) == 1
    assert len(body["instructions"]) == 2
    assert {t["name"] for t in body["tags"]} == {"italian", "quick"}
    assert "id" in body


def test_list_recipes(client):
    client.post("/recipes/", json=RECIPE_PAYLOAD)
    r = client.get("/recipes/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_get_recipe(client):
    created = client.post("/recipes/", json=RECIPE_PAYLOAD).json()
    rid = created["id"]

    r = client.get(f"/recipes/{rid}")
    assert r.status_code == 200
    assert r.json()["id"] == rid
    assert r.json()["title"] == "Test Pasta"


def test_get_recipe_not_found(client):
    r = client.get("/recipes/nonexistent-id")
    assert r.status_code == 404


def test_update_recipe(client):
    created = client.post("/recipes/", json=RECIPE_PAYLOAD).json()
    rid = created["id"]

    updated_payload = {**RECIPE_PAYLOAD, "title": "Updated Pasta", "tags": ["updated"]}
    r = client.put(f"/recipes/{rid}", json=updated_payload)
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Updated Pasta"
    assert {t["name"] for t in body["tags"]} == {"updated"}


def test_update_recipe_not_found(client):
    r = client.put("/recipes/nonexistent-id", json=RECIPE_PAYLOAD)
    assert r.status_code == 404


def test_delete_recipe(client):
    created = client.post("/recipes/", json=RECIPE_PAYLOAD).json()
    rid = created["id"]

    r = client.delete(f"/recipes/{rid}")
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    r = client.get(f"/recipes/{rid}")
    assert r.status_code == 404


def test_delete_recipe_not_found(client):
    r = client.delete("/recipes/nonexistent-id")
    assert r.status_code == 404


def test_search_recipes(client):
    client.post("/recipes/", json={**RECIPE_PAYLOAD, "title": "Searchable Carbonara"})
    r = client.get("/recipes/search/fts", params={"q": "Carbonara"})
    assert r.status_code == 200
    results = r.json()
    assert any("Carbonara" in rec["title"] for rec in results)


def test_search_recipes_no_match(client):
    r = client.get("/recipes/search/fts", params={"q": "xyzzy_no_match_12345"})
    assert r.status_code == 200
    assert r.json() == []


def test_list_pagination(client):
    for i in range(3):
        client.post("/recipes/", json={**RECIPE_PAYLOAD, "title": f"Pagination Recipe {i}"})

    r_all = client.get("/recipes/", params={"limit": 100})
    total = len(r_all.json())

    r_page = client.get("/recipes/", params={"skip": 0, "limit": 1})
    assert r_page.status_code == 200
    assert len(r_page.json()) == 1

    r_skip = client.get("/recipes/", params={"skip": total, "limit": 10})
    assert r_skip.status_code == 200
    assert len(r_skip.json()) == 0
