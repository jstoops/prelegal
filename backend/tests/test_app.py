import sqlite3
from contextlib import closing

from fastapi.testclient import TestClient

from prelegal_backend.config import Settings
from prelegal_backend.main import create_app


def test_startup_recreates_database(settings: Settings):
    settings.db_path.parent.mkdir(parents=True)
    with closing(sqlite3.connect(settings.db_path)) as conn:
        conn.execute("CREATE TABLE from_last_run (id INTEGER)")
        assert conn.execute("SELECT count(*) FROM sqlite_master").fetchone() == (1,)

    with TestClient(create_app(settings)):
        with closing(sqlite3.connect(settings.db_path)) as conn:
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    assert sorted(tables) == [("documents",), ("sessions",), ("users",)]


def test_health(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_unavailable_database(client: TestClient, settings: Settings):
    settings.db_path.unlink()
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "unavailable"}


def test_unknown_api_path_is_json_404(client: TestClient):
    for method in ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
        response = client.request(method, "/api/does-not-exist")
        assert response.status_code == 404, method
        assert response.json() == {"detail": "Not Found"}
    head = client.head("/api/does-not-exist")
    assert head.status_code == 404
    assert head.headers["content-type"] == "application/json"


def test_serves_frontend_pages(client: TestClient):
    for path, text in [
        ("/", "Sign in"),
        ("/signup/", "Create your account"),
        ("/app/", "Dashboard"),
        ("/app/create/", "Creator"),
    ]:
        response = client.get(path)
        assert response.status_code == 200, path
        assert text in response.text
        assert response.headers["content-type"].startswith("text/html")


def test_directory_without_trailing_slash_redirects(client: TestClient):
    response = client.get("/app/create", follow_redirects=False)
    assert response.status_code in (307, 308)
    assert response.headers["location"].endswith("/app/create/")


def test_unknown_page_serves_frontend_404(client: TestClient):
    response = client.get("/no-such-page/")
    assert response.status_code == 404
    assert "Page not found" in response.text


def test_api_only_when_frontend_build_missing(tmp_path):
    settings = Settings(db_path=tmp_path / "prelegal.db", static_dir=tmp_path / "missing")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404
