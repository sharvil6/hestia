"""/mcp endpoint: token auth, per-tool scopes, and the four recipe tools.

Speaks raw JSON-RPC over the streamable-HTTP transport (stateless + JSON
responses), entering the TestClient context so the app lifespan starts the
MCP session manager.
"""

import pytest

import mcp_server
from database import get_db
from main import app
from tests.conftest import make_test_client
from tests.test_recipes import RECIPE_PAYLOAD

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


@pytest.fixture
def client():
    c = make_test_client()
    original = mcp_server.db_provider
    mcp_server.db_provider = app.dependency_overrides[get_db]
    with c:
        yield c
    mcp_server.db_provider = original
    app.dependency_overrides.clear()


def _token(client, scope="read", name="Muse"):
    r = client.post("/auth/api-tokens", json={"name": name, "scope": scope})
    assert r.status_code == 201, r.text
    return r.json()["token"]


def _rpc(client, token, method, params=None, path="/mcp"):
    headers = dict(MCP_HEADERS)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.post(path, headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})


def _call(client, token, tool, args=None):
    r = _rpc(client, token, "tools/call", {"name": tool, "arguments": args or {}})
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    return result


def _ok(result):
    assert not result.get("isError"), result
    sc = result["structuredContent"]
    return sc.get("result", sc)


# ----- auth ---------------------------------------------------------------------


def test_requires_api_token(client):
    r = _rpc(client, None, "tools/list")
    assert r.status_code == 401
    assert r.headers["www-authenticate"].startswith("Bearer")
    assert _rpc(client, "hst_bogus", "tools/list").status_code == 401


def test_session_cookie_is_not_enough(client):
    # The test client is "signed in" via dependency overrides, which /mcp ignores,
    # and a raw session-style bearer value is rejected too.
    assert _rpc(client, "not-an-hst-token", "tools/list").status_code == 401


def test_revoked_token_rejected(client):
    tok = _token(client)
    tid = client.get("/auth/api-tokens").json()[0]["id"]
    assert _rpc(client, tok, "tools/list").status_code == 200
    client.delete(f"/auth/api-tokens/{tid}")
    assert _rpc(client, tok, "tools/list").status_code == 401


def test_initialize_and_trailing_slash(client):
    tok = _token(client)
    r = _rpc(client, tok, "initialize", {
        "protocolVersion": "2025-06-18", "capabilities": {},
        "clientInfo": {"name": "pytest", "version": "0"},
    })
    assert r.status_code == 200, r.text
    assert r.json()["result"]["serverInfo"]["name"] == "Hestia"
    assert _rpc(client, tok, "tools/list", path="/mcp/").status_code == 200


def test_lists_four_tools_with_read_hints(client):
    tools = {t["name"]: t for t in _rpc(client, _token(client), "tools/list").json()["result"]["tools"]}
    assert set(tools) == {"search_recipes", "get_recipe", "list_tags", "add_recipe"}
    for name in ("search_recipes", "get_recipe", "list_tags"):
        assert tools[name]["annotations"]["readOnlyHint"] is True
    assert tools["add_recipe"]["annotations"]["readOnlyHint"] is False
    # The schema the model sees for add_recipe carries the ingredient shape.
    schema = str(tools["add_recipe"]["inputSchema"])
    assert "ingredients" in schema and "qty" in schema


# ----- read tools ---------------------------------------------------------------


def _seed(client):
    a = client.post("/recipes/", json={**RECIPE_PAYLOAD, "title": "Quick Pasta", "tags": ["italian", "quick"], "prep_time": 5, "cook_time": 10}).json()
    b = client.post("/recipes/", json={**RECIPE_PAYLOAD, "title": "Slow Ragu", "tags": ["italian"], "prep_time": 30, "cook_time": 180}).json()
    return a, b


def test_search_recipes_filters(client):
    _seed(client)
    tok = _token(client)
    all_ = _ok(_call(client, tok, "search_recipes"))
    assert [r["title"] for r in all_] == ["Quick Pasta", "Slow Ragu"]
    assert "instructions" not in all_[0]
    assert [r["title"] for r in _ok(_call(client, tok, "search_recipes", {"tags": ["quick"]}))] == ["Quick Pasta"]
    assert [r["title"] for r in _ok(_call(client, tok, "search_recipes", {"max_total_time": 30}))] == ["Quick Pasta"]
    assert [r["title"] for r in _ok(_call(client, tok, "search_recipes", {"query": "ragu"}))] == ["Slow Ragu"]
    assert [r["title"] for r in _ok(_call(client, tok, "search_recipes", {"limit": 1, "offset": 1}))] == ["Slow Ragu"]


def test_get_recipe_hides_others_private_notes_and_share_token(client):
    a, _ = _seed(client)
    client.post(f"/recipes/{a['id']}/share")
    client.post(f"/recipes/{a['id']}/annotations", data={"content": "public tip"})
    db = next(app.dependency_overrides[get_db]())
    from models import Annotation
    db.add(Annotation(recipe_id=a["id"], user_id="2", content="Dad's secret", is_private=True))
    db.add(Annotation(recipe_id=a["id"], user_id="1", content="Mom's own note", is_private=True))
    db.commit()

    out = _ok(_call(client, _token(client), "get_recipe", {"recipe_id": a["id"]}))  # token owned by user 1
    assert out["title"] == "Quick Pasta"
    assert out["instructions"][0]["text"] == "Boil water"
    assert {n["content"] for n in out["annotations"]} == {"public tip", "Mom's own note"}
    assert "share_token" not in out


def test_get_recipe_unknown_id_is_tool_error(client):
    res = _call(client, _token(client), "get_recipe", {"recipe_id": "nope"})
    assert res["isError"] is True
    assert "No recipe" in res["content"][0]["text"]


def test_list_tags(client):
    _seed(client)
    assert _ok(_call(client, _token(client), "list_tags")) == ["italian", "quick"]


# ----- add_recipe ---------------------------------------------------------------

NEW = {
    "title": "Shakshuka",
    "source_url": "https://example.com/shakshuka",
    "prep_time": 10, "cook_time": 20, "original_yield": 4,
    "tags": ["Breakfast", "vegetarian"],
    "ingredients": [
        {"qty": 6, "unit": "", "item": "eggs", "note": ""},
        {"qty": 28, "unit": "oz", "item": "crushed tomatoes", "note": "1 can"},
    ],
    "instructions": [{"step_number": 1, "text": "Simmer."}, {"step_number": 2, "text": "Add eggs."}],
}


def test_add_recipe_requires_read_create_scope(client):
    res = _call(client, _token(client, "read"), "add_recipe", {"recipe": NEW})
    assert res["isError"] is True
    assert "read-only" in res["content"][0]["text"]
    assert client.get("/recipes/").json() == []


def test_add_recipe_saves_attributes_and_audits(client):
    tok = _token(client, "read_create", "Muse importer")
    out = _ok(_call(client, tok, "add_recipe", {"recipe": NEW}))
    assert out["title"] == "Shakshuka"
    assert out["tags"] == ["breakfast", "vegetarian"]

    saved = client.get(f"/recipes/{out['id']}").json()
    assert saved["created_by"] == "1"
    assert saved["source_url"] == "https://example.com/shakshuka"
    assert [i["item"] for i in saved["ingredients"]] == ["eggs", "crushed tomatoes"]

    from models import AuthEvent
    db = next(app.dependency_overrides[get_db]())
    ev = db.query(AuthEvent).filter(AuthEvent.event_type == "recipe_create_via_token").one()
    assert "Muse importer" in ev.detail and "Shakshuka" in ev.detail


def test_add_recipe_validation_error_is_reported(client):
    tok = _token(client, "read_create")
    bad = {**NEW, "ingredients": [{"unit": "cup", "item": "flour"}]}  # missing qty
    r = _rpc(client, tok, "tools/call", {"name": "add_recipe", "arguments": {"recipe": bad}})
    body = r.json()
    assert ("error" in body) or body["result"].get("isError") is True
    assert client.get("/recipes/").json() == []
