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

_MODEL = "gemini-2.0-flash-lite"

client = None
if os.environ.get("GEMINI_API_KEY"):
    genai_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    client = instructor.from_genai(client=genai_client, mode=instructor.Mode.GENAI_STRUCTURED_OUTPUTS)
    logger.info("Gemini vision client initialised")
else:
    logger.warning("GEMINI_API_KEY not set — vision extraction will be unavailable")

def extract_recipe_from_image(image_bytes: bytes) -> RecipeCreate:
    if not client:
        raise Exception("No Gemini API key supplied.")
    
    logger.info("Extracting recipe from image (%d bytes)", len(image_bytes))
    import base64
    import PIL.Image
    from instructor.processing.multimodal import Image

    # Normalize whatever the client uploaded (JPEG/PNG/HEIC-as-JPEG/etc.) into a
    # plain JPEG, then hand instructor its own Image type. Passing a raw PIL
    # Image object is not supported and raises "unsupported content type".
    img = PIL.Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    image = Image.from_raw_base64(base64.b64encode(buf.getvalue()).decode("ascii"))

    recipe_data = client.chat.completions.create(
        model=_MODEL,
        response_model=RecipeCreate,
        messages=[
            {
                "role": "user",
                "content": [
                    "Extract the title, yield (as an integer), ingredients (qty, unit, name), and instructions from this image. Fix common OCR mistakes like 112 instead of 1/2.",
                    image
                ]
            }
        ]
    )
    
    logger.info("Vision extraction succeeded: %s", recipe_data.title)
    return recipe_data
