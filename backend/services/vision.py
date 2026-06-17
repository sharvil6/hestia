import os
import io
import logging
import instructor
from google import genai
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from schemas import RecipeCreate, IngredientBase, InstructionBase

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("hestia.vision")

_MODEL = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.5-flash-lite")

client = None
if os.environ.get("GEMINI_API_KEY"):
    genai_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    client = instructor.from_genai(client=genai_client, mode=instructor.Mode.GENAI_STRUCTURED_OUTPUTS)
    logger.info("Gemini vision client initialised")
else:
    logger.warning("GEMINI_API_KEY not set — vision extraction will be unavailable")

def extract_recipe_from_image(images: "bytes | List[bytes]") -> RecipeCreate:
    if not client:
        raise Exception("No Gemini API key supplied.")

    # Accept either a single image (legacy callers / mobile) or an ordered list
    # of pages that all belong to one recipe and should be consolidated.
    if isinstance(images, (bytes, bytearray)):
        images = [bytes(images)]
    if not images:
        raise ValueError("No image data supplied.")

    logger.info("Extracting recipe from %d image(s)", len(images))
    import base64
    import PIL.Image
    from instructor.processing.multimodal import Image

    # Normalize whatever the client uploaded (JPEG/PNG/HEIC-as-JPEG/etc.) into a
    # plain JPEG, then hand instructor its own Image type. Passing a raw PIL
    # Image object is not supported and raises "unsupported content type".
    image_parts = []
    for raw in images:
        img = PIL.Image.open(io.BytesIO(raw))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        image_parts.append(Image.from_raw_base64(base64.b64encode(buf.getvalue()).decode("ascii")))

    if len(image_parts) > 1:
        prompt = (
            f"These {len(image_parts)} images are sequential pages of a SINGLE recipe, given "
            "in order (Page 1, Page 2, and so on). Consolidate them into ONE recipe: merge the "
            "ingredients and instructions from every page into single combined lists, preserving "
            "their original order across pages and not duplicating items that span a page break. "
            "Extract the title, yield (as an integer), ingredients (qty, unit, name), and "
            "instructions. Fix common OCR mistakes like 112 instead of 1/2."
        )
    else:
        prompt = (
            "Extract the title, yield (as an integer), ingredients (qty, unit, name), and "
            "instructions from this image. Fix common OCR mistakes like 112 instead of 1/2."
        )

    try:
        recipe_data = client.chat.completions.create(
            model=_MODEL,
            response_model=RecipeCreate,
            messages=[
                {
                    "role": "user",
                    "content": [prompt, *image_parts]
                }
            ]
        )
    except Exception as exc:
        # Surface which model failed — most commonly a retired/unavailable model id
        # (e.g. Google shut down gemini-2.0-flash-lite on 2026-06-01). Override via
        # the GEMINI_VISION_MODEL env var without a code change.
        logger.exception("Vision extraction failed (model=%s)", _MODEL)
        raise RuntimeError(
            f"Gemini vision extraction failed for model '{_MODEL}': {exc}"
        ) from exc

    logger.info("Vision extraction succeeded: %s", recipe_data.title)
    return recipe_data
