from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import logging
from dotenv import load_dotenv
load_dotenv()

# basicConfig is a no-op once uvicorn has configured the root logger,
# so we attach a dedicated handler to our own logger hierarchy.
_hestia_logger = logging.getLogger("hestia")
_hestia_logger.setLevel(logging.DEBUG)
if not _hestia_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    _hestia_logger.addHandler(_handler)
_hestia_logger.propagate = False  # avoid double-printing via uvicorn root

logger = _hestia_logger

from database import engine
from models import Base

# Create all tables on startup
Base.metadata.create_all(bind=engine)

from database import SessionLocal
from models import User

def seed_users():
    db = SessionLocal()
    try:
        users = [
            User(id="1", display_name="Mom"),
            User(id="2", display_name="Dad"),
            User(id="3", display_name="Kids")
        ]
        for u in users:
            existing = db.query(User).filter(User.id == u.id).first()
            if not existing:
                db.add(u)
        db.commit()
    finally:
        db.close()

seed_users()

app = FastAPI(title="Hestia Engine")

# CORS setup — scope origins for credential support
allowed_origins = os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000"
).split(",")
logger.info("CORS allowed origins: %s", allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Determine upload directory (works in Docker and local dev)
UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "uploads"))
)
os.makedirs(UPLOAD_DIR, exist_ok=True)
logger.info("Upload directory: %s", UPLOAD_DIR)

# Mount static files for images
app.mount("/images", StaticFiles(directory=UPLOAD_DIR), name="images")

from routers import recipes
app.include_router(recipes.router)

@app.get("/")
def read_root():
    logger.debug("Health check endpoint called")
    return {"status": "ok", "message": "Hestia API is running"}
