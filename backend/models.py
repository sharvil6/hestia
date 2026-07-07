import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, Date, DateTime, LargeBinary, Index, TypeDecorator, event
from sqlalchemy.orm import relationship
from database import Base
import json

class JSONEncodedDict(TypeDecorator):
    impl = String
    cache_ok = True
    
    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return json.loads(value)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    display_name = Column(String, nullable=False)
    avatar_id = Column(String, nullable=True)
    is_admin = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuthKey(Base):
    """The long-lived BIP39 word-key credential for a user.

    Only one row per user has revoked_at IS NULL at a time (the active key).
    Older rows are kept around for audit / forensics.
    """
    __tablename__ = "auth_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Public lookup prefix derived from sha256(raw_key)[:8], base32-grouped.
    # Lets login lookups be O(1) without needing to scan every hash.
    key_id = Column(String, nullable=False, unique=True, index=True)
    # Argon2 hash of the raw 16 bytes. The raw bytes are never stored.
    key_hash = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)


class Invite(Base):
    """One-time enrollment ticket issued by an admin."""
    __tablename__ = "invites"

    code = Column(String, primary_key=True)
    intended_display_name = Column(String, nullable=False)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    used_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)


class Session(Base):
    """Short-lived per-browser sessions minted from any successful credential check."""
    __tablename__ = "sessions"

    # Hashed form of the raw session token. The raw token (prefix + secret) is the cookie value.
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    id_prefix = Column(String, nullable=False, unique=True, index=True)
    id_hash = Column(String, nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    auth_method = Column(String, nullable=False)  # "word_key" | "passkey"
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    user_agent = Column(String, nullable=True)
    device_label = Column(String, nullable=True)


class Passkey(Base):
    """A WebAuthn credential bound to a user."""
    __tablename__ = "passkeys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(LargeBinary, nullable=False, unique=True, index=True)
    public_key = Column(LargeBinary, nullable=False)
    sign_count = Column(Integer, nullable=False, default=0)
    transports = Column(JSONEncodedDict, nullable=True)
    aaguid = Column(LargeBinary, nullable=True)
    nickname = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)


class WebAuthnChallenge(Base):
    """Short-TTL ceremony state. Replaces needing Redis for the few-minute challenge window."""
    __tablename__ = "webauthn_challenges"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kind = Column(String, nullable=False)  # "register" | "login"
    challenge = Column(LargeBinary, nullable=False)
    # For register: the logged-in user attaching a new passkey. For login: None (usernameless).
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    expires_at = Column(DateTime, nullable=False)

class Recipe(Base):
    __tablename__ = "recipes"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    cover_image = Column(String, nullable=True)
    original_yield = Column(Integer, nullable=True)
    prep_time = Column(Integer, nullable=True)
    cook_time = Column(Integer, nullable=True)
    source_url = Column(String, nullable=True)
    # Opt-in public sharing. NULL = not shared. A random urlsafe token is the
    # unguessable, revocable key for the read-only public page.
    share_token = Column(String, nullable=True, unique=True, index=True)
    created_by = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Store JSON strings for ingredients/instructions since SQLite doesn't have a strict JSON array type
    ingredients = Column(JSONEncodedDict, nullable=False, default=list)
    instructions = Column(JSONEncodedDict, nullable=False, default=list)

    tags = relationship("Tag", secondary="recipe_tags", back_populates="recipes")
    annotations = relationship("Annotation", back_populates="recipe", cascade="all, delete-orphan")

class Tag(Base):
    __tablename__ = "tags"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    
    recipes = relationship("Recipe", secondary="recipe_tags", back_populates="tags")

class RecipeTag(Base):
    __tablename__ = "recipe_tags"
    
    recipe_id = Column(String, ForeignKey("recipes.id"), primary_key=True)
    tag_id = Column(String, ForeignKey("tags.id"), primary_key=True)

class Annotation(Base):
    __tablename__ = "annotations"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    recipe_id = Column(String, ForeignKey("recipes.id"))
    user_id = Column(String, ForeignKey("users.id"))
    step_index = Column(Integer, nullable=True)
    content = Column(String, nullable=False)
    image_path = Column(String, nullable=True)
    is_private = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    recipe = relationship("Recipe", back_populates="annotations")
    user = relationship("User")

    @property
    def author_name(self) -> str | None:
        """Display name of the comment's author, for serialization. None if the
        authoring user has been removed."""
        return self.user.display_name if self.user else None


class MealPlan(Base):
    """A single week of planned meals. Owned by created_by; other users can be
    added as members (full edit rights, but only the owner manages membership
    and deletion)."""
    __tablename__ = "meal_plans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=True)
    # Date-only, always snapped to the Monday of the plan's week server-side.
    week_start = Column(Date, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User")
    members = relationship("User", secondary="meal_plan_members")
    entries = relationship("MealPlanEntry", back_populates="plan", cascade="all, delete-orphan",
                           order_by="MealPlanEntry.day, MealPlanEntry.slot, MealPlanEntry.position")
    grocery_items = relationship("GroceryItem", back_populates="plan", cascade="all, delete-orphan",
                                 order_by="GroceryItem.position")


class MealPlanMember(Base):
    __tablename__ = "meal_plan_members"

    plan_id = Column(String, ForeignKey("meal_plans.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


class MealPlanEntry(Base):
    """One recipe placed in one meal slot. A slot (day + slot name) can hold any
    number of entries."""
    __tablename__ = "meal_plan_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = Column(String, ForeignKey("meal_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    day = Column(Integer, nullable=False)  # 0 = Monday … 6 = Sunday
    slot = Column(String, nullable=False)  # "breakfast" | "lunch" | "dinner"
    recipe_id = Column(String, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    # Batch multiplier for this placement (2 = double the recipe). Grocery
    # aggregation multiplies ingredient quantities by it.
    scale = Column(Float, nullable=False, default=1.0)

    plan = relationship("MealPlan", back_populates="entries")
    recipe = relationship("Recipe")


class GroceryItem(Base):
    """A row on a plan's grocery list. Auto rows are derived from the planned
    recipes' ingredients and carry a merge `key` ("item|unit", normalized) so
    regeneration can reconcile without losing checked state. Manual rows
    (is_manual=True) are user-added and never touched by regeneration."""
    __tablename__ = "grocery_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = Column(String, ForeignKey("meal_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    item = Column(String, nullable=False)   # display label
    key = Column(String, nullable=False)    # merge key for auto rows; unique-ish per plan
    qty = Column(Float, nullable=True)
    unit = Column(String, nullable=False, default="")
    checked = Column(Boolean, nullable=False, default=False)
    is_manual = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)

    plan = relationship("MealPlan", back_populates="grocery_items")
