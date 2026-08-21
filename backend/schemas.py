from pydantic import BaseModel, ConfigDict, Field
from typing import List, Literal, Optional
from datetime import date, datetime

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
    # Surfaced so the home page can build recency-ordered groups ("recently
    # added"). Read straight off the model column via from_attributes.
    created_at: datetime
    updated_at: Optional[datetime] = None
    tags: List[TagResponse] = []
    annotations: List["AnnotationResponse"] = []
    model_config = ConfigDict(from_attributes=True)


class RecipeDraftSave(BaseModel):
    """Body for creating or updating a draft. `payload` is the client's form
    state verbatim — intentionally unvalidated, because a draft is allowed to be
    incomplete or inconsistent in ways a real recipe is not."""
    title: Optional[str] = None
    payload: dict = {}


class RecipeDraftSummary(BaseModel):
    """Row in the drafts list — enough to identify and rank a draft without
    shipping its whole payload."""
    id: str
    title: Optional[str] = None
    ingredient_count: int = 0
    instruction_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RecipeDraftResponse(RecipeDraftSummary):
    """A single draft, including the form state needed to resume editing."""
    payload: dict = {}


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


# --- Meal plans ---

MealSlot = Literal["breakfast", "lunch", "dinner"]


class UserPublic(BaseModel):
    """Minimal user projection safe to show to any authenticated user
    (member pickers, plan member lists)."""
    id: str
    display_name: str
    avatar_id: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class MealPlanCreate(BaseModel):
    name: Optional[str] = None
    week_start: date  # any day; snapped to Monday server-side
    member_ids: List[str] = []


class MealPlanUpdate(BaseModel):
    name: Optional[str] = None
    week_start: Optional[date] = None


class MemberSet(BaseModel):
    user_ids: List[str]


class EntryCreate(BaseModel):
    day: int = Field(ge=0, le=6)
    slot: MealSlot
    recipe_id: str
    scale: float = Field(1.0, gt=0, le=20)


class EntryUpdate(BaseModel):
    scale: float = Field(gt=0, le=20)


class RecipeSummary(BaseModel):
    id: str
    title: str
    cover_image: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class EntryResponse(BaseModel):
    id: str
    day: int
    slot: MealSlot
    position: int
    scale: float
    recipe: RecipeSummary
    model_config = ConfigDict(from_attributes=True)


class GroceryItemCreate(BaseModel):
    item: str
    qty: Optional[float] = None
    unit: str = ""


class GroceryItemUpdate(BaseModel):
    checked: Optional[bool] = None
    # Label/qty/unit edits only apply to manual rows.
    item: Optional[str] = None
    qty: Optional[float] = None
    unit: Optional[str] = None


class GroceryItemResponse(BaseModel):
    id: str
    item: str
    qty: Optional[float] = None
    unit: str
    checked: bool
    is_manual: bool
    position: int
    model_config = ConfigDict(from_attributes=True)


class MealPlanSummary(BaseModel):
    id: str
    name: Optional[str] = None
    week_start: date
    created_by: str
    owner: UserPublic
    members: List[UserPublic] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class MealPlanDetail(MealPlanSummary):
    entries: List[EntryResponse] = []
    grocery_items: List[GroceryItemResponse] = []
