"""Read-only API tokens: management endpoints + scope enforcement.

The default conftest client stubs get_current_user, which would bypass token
resolution entirely. These tests drop that override so requests carrying a
bearer token go through the real auth.deps path. get_current_session stays
stubbed (user "1") so the management endpoints can be called as a browser
session would.
"""

import pytest

from auth.deps import get_current_user
from main import app
from tests.conftest import make_test_client
from tests.test_recipes import RECIPE_PAYLOAD


@pytest.fixture
def client():
    c = make_test_client()
    yield c
    app.dependency_overrides.clear()


@pytest.fixture
def real_auth(client):
    """Same client, but get_current_user is no longer stubbed."""
    app.dependency_overrides.pop(get_current_user, None)
    return client


def _mint(client, name="Muse"):
    r = client.post("/auth/api-tokens", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_returns_token_once_and_lists_without_it(client):
    body = _mint(client, "Muse meal planner")
    assert body["token"].startswith("hst_")
    assert body["name"] == "Muse meal planner"
    assert body["scope"] == "read"
    assert body["token"][4:12] == body["id_prefix"]

    listed = client.get("/auth/api-tokens").json()
    assert [t["id"] for t in listed] == [body["id"]]
    assert "token" not in listed[0]
    assert listed[0]["last_used_at"] is None


def test_create_rejects_blank_name(client):
    assert client.post("/auth/api-tokens", json={"name": "   "}).status_code == 422
    assert client.post("/auth/api-tokens", json={"name": ""}).status_code == 422


def test_token_can_read_recipes_and_tags(real_auth):
    # Seed a recipe through the session-only path, then restore real auth.
    app.dependency_overrides[get_current_user] = lambda: __import__("models").User(id="1", display_name="Mom")
    created = real_auth.post("/recipes/", json=RECIPE_PAYLOAD).json()
    app.dependency_overrides.pop(get_current_user)

    tok = _mint(real_auth)["token"]
    h = _bearer(tok)

    r = real_auth.get("/recipes/", headers=h)
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == [created["id"]]
    assert real_auth.get(f"/recipes/{created['id']}", headers=h).status_code == 200
    assert real_auth.get("/recipes/search/fts", params={"q": "pasta"}, headers=h).status_code == 200
    assert real_auth.get("/tags/", headers=h).status_code == 200

    listed = real_auth.get("/auth/api-tokens").json()
    assert listed[0]["last_used_at"] is not None


@pytest.mark.parametrize("method,path", [
    ("post", "/recipes/"),
    ("put", "/recipes/abc"),
    ("delete", "/recipes/abc"),
    ("get", "/recipes/drafts/"),
    ("get", "/plans/"),
    ("get", "/auth/me"),
    ("get", "/admin/activity"),
])
def test_token_is_forbidden_outside_read_scope(real_auth, method, path):
    tok = _mint(real_auth)["token"]
    kwargs = {"headers": _bearer(tok)}
    if method in ("post", "put"):
        kwargs["json"] = RECIPE_PAYLOAD
    r = getattr(real_auth, method)(path, **kwargs)
    assert r.status_code == 403, (path, r.status_code, r.text)


def test_bad_and_revoked_tokens_are_unauthorized(real_auth):
    body = _mint(real_auth)
    h = _bearer(body["token"])
    assert real_auth.get("/recipes/", headers=h).status_code == 200

    # Right prefix, wrong secret.
    forged = body["token"][:12] + "x" * (len(body["token"]) - 12)
    assert real_auth.get("/recipes/", headers=_bearer(forged)).status_code == 401
    assert real_auth.get("/recipes/", headers=_bearer("hst_nope")).status_code == 401

    assert real_auth.delete(f"/auth/api-tokens/{body['id']}").status_code == 200
    assert real_auth.get("/recipes/", headers=h).status_code == 401
    assert real_auth.get("/auth/api-tokens").json() == []
    assert real_auth.delete(f"/auth/api-tokens/{body['id']}").status_code == 404


def test_api_token_cannot_manage_tokens(real_auth):
    """Management uses get_current_session, which never accepts an API token."""
    from auth.deps import get_current_session
    tok = _mint(real_auth)["token"]
    app.dependency_overrides.pop(get_current_session)
    r = real_auth.post("/auth/api-tokens", json={"name": "escalate"}, headers=_bearer(tok))
    assert r.status_code == 401
    assert real_auth.get("/auth/api-tokens", headers=_bearer(tok)).status_code == 401


# ----- read_create scope ---------------------------------------------------------


def _mint_scoped(client, scope, name="Muse"):
    r = client.post("/auth/api-tokens", json={"name": name, "scope": scope})
    assert r.status_code == 201, r.text
    return r.json()


def test_default_scope_is_read_and_unknown_scope_rejected(client):
    assert _mint(client)["scope"] == "read"
    assert client.post("/auth/api-tokens", json={"name": "x", "scope": "admin"}).status_code == 422
    assert client.post("/auth/api-tokens", json={"name": "x", "scope": "write"}).status_code == 422


def test_read_create_token_can_create_recipe_attributed_to_owner(real_auth):
    body = _mint_scoped(real_auth, "read_create", "Muse importer")
    assert body["scope"] == "read_create"
    h = _bearer(body["token"])

    r = real_auth.post("/recipes/", json={**RECIPE_PAYLOAD, "title": "From Muse"}, headers=h)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["created_by"] == "1"
    # It can still read, including the thing it just made.
    assert real_auth.get(f"/recipes/{created['id']}", headers=h).status_code == 200
    assert [x["title"] for x in real_auth.get("/recipes/summary", headers=h).json()] == ["From Muse"]


def test_read_create_token_creation_is_audited(real_auth):
    from database import get_db
    from models import AuthEvent
    body = _mint_scoped(real_auth, "read_create", "Muse importer")
    real_auth.post("/recipes/", json={**RECIPE_PAYLOAD, "title": "Audited"}, headers=_bearer(body["token"]))
    db = next(app.dependency_overrides[get_db]())
    events = db.query(AuthEvent).filter(AuthEvent.event_type == "recipe_create_via_token").all()
    assert len(events) == 1
    assert events[0].user_id == "1"
    assert "Muse importer" in events[0].detail and "Audited" in events[0].detail


def test_read_token_still_cannot_create(real_auth):
    tok = _mint(real_auth)["token"]
    r = real_auth.post("/recipes/", json=RECIPE_PAYLOAD, headers=_bearer(tok))
    assert r.status_code == 403


@pytest.mark.parametrize("method,path,kwargs", [
    ("put", "/recipes/abc", {"json": RECIPE_PAYLOAD}),
    ("delete", "/recipes/abc", {}),
    ("post", "/recipes/abc/share", {}),
    ("post", "/recipes/abc/annotations", {"data": {"content": "hi"}}),
    ("post", "/recipes/ingest/url", {"data": {"url": "http://127.0.0.1:8000/"}}),
    ("post", "/recipes/scrape/preview", {"data": {"url": "http://127.0.0.1:8000/"}}),
    ("post", "/recipes/upload-image", {}),
    ("post", "/recipes/drafts/", {"json": {}}),
    ("post", "/plans/", {"json": {"week_start": "2026-11-23"}}),
    ("post", "/auth/api-tokens", {"json": {"name": "escalate", "scope": "read_create"}}),
])
def test_read_create_token_is_limited_to_create(real_auth, method, path, kwargs):
    from auth.deps import get_current_session
    tok = _mint_scoped(real_auth, "read_create")["token"]
    app.dependency_overrides.pop(get_current_session)  # token-management must see the real dep too
    r = getattr(real_auth, method)(path, headers=_bearer(tok), **kwargs)
    assert r.status_code in (401, 403), (path, r.status_code, r.text)


def test_session_created_recipe_also_records_created_by(client):
    r = client.post("/recipes/", json=RECIPE_PAYLOAD)
    assert r.json()["created_by"] == "1"
