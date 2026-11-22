"""MCP endpoint (/mcp) so agents like Muse can use Hestia as a recipe store.

Thin layer over the REST helpers — no logic of its own beyond auth and shaping.

Auth: `Authorization: Bearer hst_…` API tokens only (minted on the Security
page). Browser cookies and session tokens are not accepted here. Scopes are
enforced per tool: every token can call the read tools; `add_recipe` needs a
"read_create" token.

Transport: streamable HTTP, stateless, JSON responses — each POST is a
self-contained request, so there's no per-client session state to keep alive
across deploys or restarts.
"""

from __future__ import annotations

import contextlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterator, List, Optional

from mcp.server.fastmcp import Context, FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy.orm import Session
from starlette.requests import Request

import models
import schemas
from auth.deps import SCOPE_READ_CREATE, authenticate_api_token, read_bearer
from database import get_db
from routers.recipes import _save_new_recipe, query_summaries

logger = logging.getLogger("hestia.mcp")

# Swappable so tests can point tools at their in-memory DB (same generator
# contract as FastAPI's get_db dependency).
db_provider = get_db


@contextlib.contextmanager
def _db() -> Iterator[Session]:
    gen = db_provider()
    db = next(gen)
    try:
        yield db
    finally:
        with contextlib.suppress(StopIteration):
            next(gen)


INSTRUCTIONS = """\
Hestia is a family recipe library. Use search_recipes to browse or filter
(it returns compact summaries), get_recipe for the full recipe, list_tags to
see existing tags, and add_recipe to save a new recipe (needs a token with
"Read + add recipes" access). Prefer reusing existing tag names. Recipes
can't be edited or deleted through this server."""

mcp = FastMCP(
    name="Hestia",
    instructions=INSTRUCTIONS,
    stateless_http=True,
    json_response=True,
    streamable_http_path="/mcp",
    # The SDK's DNS-rebinding guard exists for unauthenticated localhost
    # servers a browser could be tricked into reaching. Every request here must
    # carry a secret bearer token (no cookies are honoured), so a rebinding page
    # gains nothing — and the guard's host allowlist would otherwise reject the
    # public hostname behind Cloudflare.
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


# ----- auth -------------------------------------------------------------------


@dataclass(frozen=True)
class CallerToken:
    """Plain snapshot of the authenticated API token. Tools run in their own DB
    session, so they get values, not an ORM row bound to the auth session."""
    id: str
    id_prefix: str
    name: str
    scope: str
    user_id: str


def _caller(ctx: Context) -> tuple[CallerToken, Request]:
    request = ctx.request_context.request
    tok = getattr(request.state, "api_token", None) if request is not None else None
    if tok is None:  # the ASGI wrapper guarantees this; belt and braces
        raise ToolError("not authenticated")
    return tok, request


class TokenAuthedMCP:
    """ASGI app for /mcp: verifies the bearer API token, stashes it on the
    request scope for the tools, then hands off to the MCP session manager."""

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return
        request = Request(scope)
        caller = None
        with _db() as db:
            resolved = authenticate_api_token(read_bearer(request), db)
            if resolved is not None:
                t = resolved[0]
                caller = CallerToken(id=t.id, id_prefix=t.id_prefix, name=t.name, scope=t.scope, user_id=t.user_id)
        if caller is None:
            body = json.dumps({"detail": "Hestia API token required (Authorization: Bearer hst_…)"}).encode()
            await send({
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"www-authenticate", b'Bearer realm="hestia"'),
                ],
            })
            await send({"type": "http.response.body", "body": body})
            return
        scope.setdefault("state", {})["api_token"] = caller
        await mcp.session_manager.handle_request(scope, receive, send)


def fresh_session_manager():
    """A StreamableHTTPSessionManager can only run() once, so the app lifespan
    asks for a new one each time it starts (tests, in-process restarts)."""
    mcp._session_manager = None
    mcp.streamable_http_app()  # lazily constructs mcp.session_manager
    return mcp.session_manager


mcp_asgi_app = TokenAuthedMCP()


# ----- tools ------------------------------------------------------------------

_READ = ToolAnnotations(readOnlyHint=True, openWorldHint=False)


@mcp.tool(
    title="Search recipes",
    annotations=_READ,
    description=(
        "Search Hestia's recipes. Returns compact summaries (title, tags, prep/cook/total "
        "minutes, ingredient names) — call get_recipe for steps and quantities. All filters "
        "are optional and combine with AND. Results are ordered oldest change first; page "
        "with offset/limit."
    ),
)
def search_recipes(
    ctx: Context,
    query: Optional[str] = Field(None, description="Substring match on title or description."),
    tags: List[str] = Field(default_factory=list, description="Recipe must have every one of these tags."),
    max_total_time: Optional[int] = Field(None, ge=0, description="Max prep+cook minutes. Excludes recipes with no times."),
    updated_since: Optional[datetime] = Field(None, description="Only recipes changed at/after this ISO-8601 time (UTC if no offset)."),
    limit: int = Field(100, ge=1, le=500),
    offset: int = Field(0, ge=0),
) -> List[schemas.RecipeListItem]:
    _caller(ctx)
    with _db() as db:
        return query_summaries(
            db, tags=tags, max_total_time=max_total_time, q=query,
            updated_since=updated_since, skip=offset, limit=limit,
        )


@mcp.tool(
    title="Get recipe",
    annotations=_READ,
    description="Full recipe by id: ingredients with quantities, numbered steps, tags, and family notes.",
)
def get_recipe(ctx: Context, recipe_id: str = Field(description="Recipe id from search_recipes.")) -> dict[str, Any]:
    tok, _ = _caller(ctx)
    with _db() as db:
        recipe = db.query(models.Recipe).filter(models.Recipe.id == recipe_id).first()
        if recipe is None:
            raise ToolError(f"No recipe with id {recipe_id}")
        out = schemas.RecipeResponse.model_validate(recipe).model_dump(mode="json")
        # Private notes are only for their author (the token's owner).
        out["annotations"] = [
            a for a, row in zip(out["annotations"], recipe.annotations)
            if not row.is_private or row.user_id == tok.user_id
        ]
        out.pop("share_token", None)
        return out


@mcp.tool(
    title="List tags",
    annotations=_READ,
    description="All tag names in use, alphabetical. Reuse these when adding recipes.",
)
def list_tags(ctx: Context) -> List[str]:
    _caller(ctx)
    with _db() as db:
        return [t.name for t in db.query(models.Tag).order_by(models.Tag.name).all()]


@mcp.tool(
    title="Add recipe",
    annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False),
    description=(
        "Save a new recipe to Hestia (e.g. one you extracted or translated from a web page). "
        "Requires a token with 'Read + add recipes' access. Each ingredient needs qty (number; "
        "use 0 for 'to taste'), unit ('' if none, e.g. for '3 eggs'), and item (the ingredient "
        "itself); put preparation or package details in note ('finely diced', '1 can'). Number "
        "steps from 1. Times are minutes. Set source_url to the original page. Tags are "
        "lowercased; reuse names from list_tags where they fit. Search first to avoid adding "
        "a duplicate."
    ),
)
def add_recipe(ctx: Context, recipe: schemas.RecipeCreate) -> dict[str, Any]:
    tok, request = _caller(ctx)
    if tok.scope != SCOPE_READ_CREATE:
        raise ToolError("This token is read-only. Create a 'Read + add recipes' token in Hestia's Security settings.")
    if not recipe.title.strip():
        raise ToolError("title is required")
    with _db() as db:
        user = db.query(models.User).filter(models.User.id == tok.user_id).first()
        if user is None:
            raise ToolError("token owner no longer exists")
        request.state.api_token = tok  # attribution in the audit log
        saved = _save_new_recipe(db, recipe, user, request)
        logger.info("MCP add_recipe via %s: %s (%s)", tok.id_prefix, saved.title, saved.id)
        return {"id": saved.id, "title": saved.title, "tags": sorted(t.name for t in saved.tags)}
