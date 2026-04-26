import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, DateTime, TypeDecorator, event
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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
