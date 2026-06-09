import os
import tempfile

# database.py refuses to guess a DB_DIR. Tests override get_db with an
# in-memory engine so the on-disk path is never written to — we just need a
# valid string for the module-level resolution.
os.environ.setdefault("DB_DIR", tempfile.gettempdir())

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models import Base, User, Session as SessionModel
from database import get_db
from auth.deps import get_current_user, get_current_session
from main import app


def make_test_client() -> TestClient:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = Session()
    for uid, name in [("1", "Mom"), ("2", "Dad"), ("3", "Kids")]:
        db.add(User(id=uid, display_name=name))
    db.commit()
    db.close()

    def override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    def override_get_current_user():
        return User(id="1", display_name="Mom", is_admin=True)

    def override_get_current_session():
        return SessionModel(id="test-session", user_id="1", auth_method="word_key")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_current_session] = override_get_current_session
    return TestClient(app)


@pytest.fixture
def client() -> TestClient:
    c = make_test_client()
    yield c
    app.dependency_overrides.clear()
