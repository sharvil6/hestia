import os
import io
import logging
import instructor
import google.generativeai as genai
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from schemas import RecipeCreate, IngredientBase, InstructionBase

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("hestia.vision")

client = None
if os.environ.get("GEMINI_API_KEY"):
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
    genai_client = genai.GenerativeModel('gemini-3.1-flash-lite-preview')
    client = instructor.from_gemini(client=genai_client, mode=instructor.Mode.GEMINI_JSON)
    logger.info("Gemini vision client initialised")
else:
    logger.warning("GEMINI_API_KEY not set — vision extraction will be unavailable")

def extract_recipe_from_image(image_bytes: bytes) -> RecipeCreate:
    if not client:
        raise Exception("No Gemini API key supplied.")
    
    logger.info("Extracting recipe from image (%d bytes)", len(image_bytes))
    import PIL.Image
    img = PIL.Image.open(io.BytesIO(image_bytes))

    recipe_data = client.chat.completions.create(
        response_model=RecipeCreate,
        messages=[
            {
                "role": "user",
                "content": [
                    "Extract the title, yield (as an integer), ingredients (qty, unit, name), and instructions from this image. Fix common OCR mistakes like 112 instead of 1/2.",
                    img
                ]
            }
        ]
    )
    
    logger.info("Vision extraction succeeded: %s", recipe_data.title)
    return recipe_data
