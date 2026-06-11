import logging
from curl_cffi import requests
from recipe_scrapers import scrape_html
from schemas import RecipeCreate, IngredientBase, InstructionBase

logger = logging.getLogger("hestia.scraper")

# curl_cffi impersonates a real browser's TLS/JA3 + HTTP/2 fingerprint, which
# is what trips Cloudflare on sites like seriouseats.com when plain `requests`
# is used from a server. Keep this; reverting to `requests` will resurrect the
# HTTP 403 we saw on 2026-06-10.
_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
}


def _safe_call(fn, default=None):
    """Safely call a scraper method, returning default if data is unavailable."""
    try:
        return fn()
    except Exception as exc:
        logger.debug("_safe_call(%s) suppressed: %s", getattr(fn, '__name__', fn), exc)
        return default


def _parse_ingredient_string(raw: str) -> IngredientBase:
    """
    Parse a raw ingredient string like '1 1/2 cups flour, sifted' into
    structured fields using recipe_scrapers' ingredient_parser when available,
    with a regex fallback.
    """
    # Try recipe_scrapers' built-in ingredient parser first
    try:
        from ingredient_parser import parse_ingredient
        result = parse_ingredient(raw)
        qty = 1.0
        unit = ""
        item = raw
        note = ""

        # Extract quantity
        if result.amount:
            amt = result.amount[0]
            try:
                qty = float(amt.quantity) if amt.quantity else 1.0
            except (ValueError, TypeError):
                qty = 1.0
            unit = str(amt.unit) if getattr(amt, "unit", None) else ""

        # Extract name
        if result.name:
            item = str(result.name)

        # Extract comment/note
        if hasattr(result, "comment") and result.comment:
            note = str(result.comment)

        return IngredientBase(qty=qty, unit=unit, item=item, note=note)
    except Exception:
        pass

    # Regex fallback
    import re
    pattern = re.compile(
        r'^([\d\.\/]+(?: \d+\/\d+)?)\s*'
        r'(?:(cup|cups|tbsp|tsp|tablespoon|tablespoons|teaspoon|teaspoons|'
        r'oz|ounce|ounces|g|gram|grams|mg|kg|ml|lb|lbs|pound|pounds|'
        r'pinch|dash|pt|qt|gallon|gallons|stick|sticks|can|cans|box|boxes)\b)?\s*'
        r'(.*?)(?:,\s*(.*))?$',
        re.IGNORECASE
    )
    match = pattern.match(raw.strip())
    if match:
        qty_str = match.group(1) or "1"
        unit = (match.group(2) or "").lower()
        item = match.group(3) or raw.strip()
        note = match.group(4) or ""
        try:
            if "/" in qty_str:
                parts = qty_str.split()
                if len(parts) == 2:
                    whole, frac = float(parts[0]), parts[1].split("/")
                    qty = whole + float(frac[0]) / float(frac[1])
                else:
                    frac = qty_str.split("/")
                    qty = float(frac[0]) / float(frac[1])
            else:
                qty = float(qty_str)
        except (ValueError, ZeroDivisionError):
            qty = 1.0
    else:
        qty, unit, item, note = 1.0, "", raw.strip(), ""

    return IngredientBase(qty=qty, unit=unit, item=item, note=note)


def scrape_recipe_from_url(url: str) -> RecipeCreate:
    logger.info("Scraping URL: %s", url)
    response = requests.get(url, headers=_HEADERS, timeout=15, impersonate="chrome")
    logger.info("HTTP %s from %s", response.status_code, url)
    response.raise_for_status()
    scraper = scrape_html(response.text, org_url=url, wild_mode=True)
    logger.info("Scraper initialised (host=%s)", scraper.host())

    title = scraper.title()
    try:
        yld = scraper.yields()
        original_yield = int(''.join(filter(str.isdigit, yld))) if yld else 1
    except (ValueError, TypeError):
        original_yield = 1

    ingredients = []
    for ing_str in scraper.ingredients():
        ingredients.append(_parse_ingredient_string(ing_str))
    logger.info("Parsed %d ingredient(s)", len(ingredients))

    instructions = []
    step_num = 1
    raw_instructions = _safe_call(scraper.instructions, "")
    for step in raw_instructions.split("\n"):
        if step.strip():
            instructions.append(InstructionBase(step_number=step_num, text=step.strip()))
            step_num += 1
    logger.info("Parsed %d instruction step(s)", len(instructions))

    return RecipeCreate(
        title=title,
        description=_safe_call(scraper.description),
        cover_image=_safe_call(scraper.image),
        original_yield=original_yield,
        prep_time=_safe_call(scraper.prep_time),
        cook_time=_safe_call(scraper.cook_time),
        source_url=url,
        ingredients=ingredients,
        instructions=instructions,
        tags=[]
    )
