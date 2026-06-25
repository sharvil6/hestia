from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    display_name: str
    avatar_id: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class IngredientBase(BaseModel):
    qty: float
    unit: str
    item: str
    note: Optional[str] = ""

class InstructionBase(BaseModel):
    step_number: int
    text: str
    image_path: Optional[str] = None

class TagBase(BaseModel):
    name: str

class TagResponse(TagBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

class RecipeBase(BaseModel):
    title: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    original_yield: Optional[int] = 1
    prep_time: Optional[int] = None
    cook_time: Optional[int] = None
    source_url: Optional[str] = None
    ingredients: List[IngredientBase] = []
    instructions: List[InstructionBase] = []

class RecipeCreate(RecipeBase):
    tags: List[str] = []

class RecipeResponse(RecipeBase):
    id: str
    created_by: Optional[str] = None
    # Present (non-null) when the recipe has a live public share link. Lets the
    # detail page show the current share state without a second request.
    share_token: Optional[str] = None
    tags: List[TagResponse] = []
    annotations: List["AnnotationResponse"] = []
    model_config = ConfigDict(from_attributes=True)


class ShareResponse(BaseModel):
    """The current public-share state of a recipe (null token = not shared)."""
    share_token: Optional[str] = None


class PublicAnnotation(BaseModel):
    """A comment as exposed on the public page. Deliberately omits user_id and
    is_private — only public comments are ever serialized through this."""
    id: str
    step_index: Optional[int] = None
    content: str
    image_path: Optional[str] = None
    author_name: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PublicRecipeResponse(BaseModel):
    """Read-only recipe payload for the unauthenticated public share page.
    A narrowed projection of RecipeResponse — no created_by, no share_token,
    and only non-private comments."""
    id: str
    title: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    original_yield: Optional[int] = 1
    prep_time: Optional[int] = None
    cook_time: Optional[int] = None
    source_url: Optional[str] = None
    ingredients: List[IngredientBase] = []
    instructions: List[InstructionBase] = []
    tags: List[TagResponse] = []
    annotations: List[PublicAnnotation] = []
    model_config = ConfigDict(from_attributes=True)

class AnnotationBase(BaseModel):
    step_index: Optional[int] = None
    content: str
    image_path: Optional[str] = None
    is_private: bool = False

class AnnotationCreate(AnnotationBase):
    pass

class AnnotationResponse(AnnotationBase):
    id: str
    recipe_id: str
    user_id: Optional[str] = None
    author_name: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Rebuild the model to resolve the "AnnotationResponse" forward reference
RecipeResponse.model_rebuild()
