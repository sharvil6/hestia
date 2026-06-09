import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import event

# DB_DIR must be set in the environment — by backend/.env in dev (loaded by
# uvicorn/main.py via python-dotenv) or by the systemd unit in prod. A silent
# fallback here used to create phantom databases when a script imported this
# module without loading .env first, so we refuse to guess.
DB_DIR = os.environ.get("DB_DIR")
if not DB_DIR:
    raise RuntimeError(
        "DB_DIR is not set. In dev, run from backend/ so backend/.env is loaded "
        "(uvicorn main:app --reload), or call dotenv.load_dotenv() before "
        "importing database. In prod, the systemd unit sets DB_DIR explicitly."
    )
os.makedirs(DB_DIR, exist_ok=True)
SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'hestia.db')}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema_upgrades():
    """In-place schema fixups for columns added after a table was first created.

    SQLite's ALTER TABLE ADD COLUMN handles the simple cases (Base.metadata.create_all
    is a no-op on pre-existing tables, so it cannot add new columns by itself).
    Keep this list minimal — for anything beyond an additive column, use a real
    migration tool.
    """
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as conn:
        if "users" in table_names:
            cols = {c["name"] for c in inspector.get_columns("users")}
            if "is_admin" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
