from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from prelegal_backend.config import Settings
from prelegal_backend.main import create_app


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """A minimal stand-in for the Next.js static export."""
    out = tmp_path / "out"
    (out / "app" / "nda").mkdir(parents=True)
    (out / "index.html").write_text("<h1>Sign in</h1>")
    (out / "app" / "index.html").write_text("<h1>Dashboard</h1>")
    (out / "app" / "nda" / "index.html").write_text("<h1>NDA</h1>")
    (out / "404.html").write_text("<h1>Page not found</h1>")
    return out


@pytest.fixture
def settings(tmp_path: Path, static_dir: Path) -> Settings:
    return Settings(db_path=tmp_path / "data" / "prelegal.db", static_dir=static_dir)


@pytest.fixture
def client(settings: Settings):
    # Entering the context runs the lifespan, which creates the database.
    with TestClient(create_app(settings)) as client:
        yield client
