import pytest

RECIPE_PAYLOAD = {
    "title": "Annotation Test Recipe",
    "ingredients": [],
    "instructions": [
        {"step_number": 1, "text": "Do the thing"},
    ],
    "tags": [],
}


@pytest.fixture
def recipe_id(client):
    r = client.post("/recipes/", json=RECIPE_PAYLOAD)
    assert r.status_code == 200
    return r.json()["id"]


def test_add_annotation(client, recipe_id):
    r = client.post(
        f"/recipes/{recipe_id}/annotations",
        data={"content": "Great tip here", "step_index": "0", "user_id": "1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["content"] == "Great tip here"
    assert body["step_index"] == 0
    assert body["recipe_id"] == recipe_id
    assert body["user_id"] == "1"
    assert "id" in body


def test_add_annotation_recipe_not_found(client):
    r = client.post(
        "/recipes/nonexistent/annotations",
        data={"content": "Orphan note"},
    )
    assert r.status_code == 404


def test_update_annotation(client, recipe_id):
    created = client.post(
        f"/recipes/{recipe_id}/annotations",
        data={"content": "Original content"},
    ).json()
    ann_id = created["id"]

    r = client.put(f"/recipes/annotations/{ann_id}", data={"content": "Updated content"})
    assert r.status_code == 200
    assert r.json()["content"] == "Updated content"


def test_update_annotation_not_found(client):
    r = client.put("/recipes/annotations/nonexistent", data={"content": "x"})
    assert r.status_code == 404


def test_delete_annotation(client, recipe_id):
    created = client.post(
        f"/recipes/{recipe_id}/annotations",
        data={"content": "To be deleted"},
    ).json()
    ann_id = created["id"]

    r = client.delete(f"/recipes/annotations/{ann_id}")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_delete_annotation_not_found(client):
    r = client.delete("/recipes/annotations/nonexistent")
    assert r.status_code == 404


def test_annotation_appears_in_recipe(client, recipe_id):
    client.post(
        f"/recipes/{recipe_id}/annotations",
        data={"content": "Step note", "step_index": "1"},
    )
    r = client.get(f"/recipes/{recipe_id}")
    assert r.status_code == 200
    annotations = r.json()["annotations"]
    assert any(a["content"] == "Step note" for a in annotations)


def test_annotation_deleted_with_recipe(client, recipe_id):
    client.post(
        f"/recipes/{recipe_id}/annotations",
        data={"content": "Orphan check"},
    )
    client.delete(f"/recipes/{recipe_id}")
    # Recipe is gone; annotations should be cascade-deleted (no way to query them directly)
    r = client.get(f"/recipes/{recipe_id}")
    assert r.status_code == 404
