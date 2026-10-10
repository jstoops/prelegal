import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from prelegal_backend.config import Settings
from prelegal_backend.main import SESSION_COOKIE, create_app

from conftest import PASSWORD, sign_up


def credentials(email="alice@example.com", password=PASSWORD) -> dict:
    return {"email": email, "password": password}


def query(settings: Settings, sql: str, *params):
    with closing(sqlite3.connect(settings.db_path)) as conn:
        return conn.execute(sql, params).fetchall()


class TestSignUp:
    def test_creates_an_account_and_signs_in(self, client: TestClient):
        response = client.post("/api/auth/signup", json=credentials())

        assert response.status_code == 201
        assert response.json() == {"email": "alice@example.com"}
        assert client.get("/api/auth/me").json() == {"email": "alice@example.com"}

    def test_session_cookie_is_http_only_and_same_site(self, client: TestClient):
        response = client.post("/api/auth/signup", json=credentials())
        cookie = response.headers["set-cookie"]
        assert cookie.startswith(f"{SESSION_COOKIE}=")
        assert "HttpOnly" in cookie
        assert "SameSite=lax" in cookie
        assert "Path=/" in cookie
        assert "Secure" not in cookie  # http://localhost

    def test_secure_cookie_when_configured(self, settings: Settings):
        secure = Settings(**{**settings.__dict__, "cookie_secure": True})
        with TestClient(create_app(secure)) as client:
            response = client.post("/api/auth/signup", json=credentials())
        assert "Secure" in response.headers["set-cookie"]

    def test_normalizes_the_email(self, client: TestClient):
        response = client.post("/api/auth/signup", json=credentials("  Alice@Example.COM "))
        assert response.json() == {"email": "alice@example.com"}

    def test_duplicate_email_is_409_whatever_the_case(self, client: TestClient):
        sign_up(client)
        response = client.post("/api/auth/signup", json=credentials("ALICE@example.com"))
        assert response.status_code == 409
        assert response.json() == {"detail": "An account with this email already exists."}

    @pytest.mark.parametrize(
        ("body", "message"),
        [
            (credentials("not-an-email"), "Enter a valid email address."),
            (credentials("a@b"), "Enter a valid email address."),
            (credentials("a b@example.com"), "Enter a valid email address."),
            (credentials("x" * 250 + "@example.com"), "Enter a valid email address."),
            (credentials(password="short"), "Use a password of at least 8 characters."),
        ],
    )
    def test_rejects_invalid_credentials(self, client: TestClient, body, message):
        response = client.post("/api/auth/signup", json=body)
        assert response.status_code == 422
        assert message in response.json()["detail"][0]["msg"]

    def test_rejects_very_long_passwords(self, client: TestClient):
        response = client.post("/api/auth/signup", json=credentials(password="x" * 129))
        assert response.status_code == 422

    def test_stores_only_hashes(self, client: TestClient, settings: Settings):
        response = client.post("/api/auth/signup", json=credentials())
        token = response.cookies[SESSION_COOKIE]

        [(password_hash,)] = query(settings, "SELECT password_hash FROM users")
        assert PASSWORD not in password_hash
        [(token_hash,)] = query(settings, "SELECT token_hash FROM sessions")
        assert token_hash != token


class TestSignIn:
    def test_signs_in_with_the_right_password(self, client: TestClient):
        sign_up(client)
        client.cookies.clear()

        response = client.post("/api/auth/signin", json=credentials(" ALICE@example.com"))

        assert response.status_code == 200
        assert response.json() == {"email": "alice@example.com"}
        assert client.get("/api/auth/me").status_code == 200

    def test_wrong_password_and_unknown_email_look_the_same(self, client: TestClient):
        sign_up(client)
        client.cookies.clear()

        wrong_password = client.post("/api/auth/signin", json=credentials(password="wrong password"))
        unknown_email = client.post("/api/auth/signin", json=credentials("nobody@example.com"))

        for response in (wrong_password, unknown_email):
            assert response.status_code == 401
            assert response.json() == {"detail": "Incorrect email or password."}
            assert SESSION_COOKIE not in response.cookies
        assert client.get("/api/auth/me").status_code == 401

    def test_short_existing_passwords_are_just_wrong(self, client: TestClient):
        # Only new passwords have a minimum length.
        response = client.post("/api/auth/signin", json=credentials(password="short"))
        assert response.status_code == 401


class TestSession:
    def test_me_needs_a_session(self, client: TestClient):
        response = client.get("/api/auth/me")
        assert response.status_code == 401
        assert response.json() == {"detail": "Please sign in to continue."}

    def test_unknown_token_is_401(self, client: TestClient):
        client.cookies.set(SESSION_COOKIE, "made-up")
        assert client.get("/api/auth/me").status_code == 401

    def test_sign_out_ends_the_session(self, client: TestClient):
        token = sign_up(client).cookies[SESSION_COOKIE]

        response = client.post("/api/auth/signout")

        assert response.status_code == 204
        assert f'{SESSION_COOKIE}=""' in response.headers["set-cookie"]
        assert "Max-Age=0" in response.headers["set-cookie"]
        # The old token no longer works, even if a copy of it was kept.
        client.cookies.set(SESSION_COOKIE, token)
        assert client.get("/api/auth/me").status_code == 401

    def test_sign_out_when_signed_out_is_fine(self, client: TestClient):
        assert client.post("/api/auth/signout").status_code == 204

    def test_expired_session_is_401(self, client: TestClient, settings: Settings):
        sign_up(client)
        with closing(sqlite3.connect(settings.db_path)) as conn, conn:
            conn.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000000+00:00'")
        assert client.get("/api/auth/me").status_code == 401

    def test_expired_sessions_are_tidied_up(self, client: TestClient, settings: Settings):
        sign_up(client)
        with closing(sqlite3.connect(settings.db_path)) as conn, conn:
            conn.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000000+00:00'")
        client.post("/api/auth/signin", json=credentials())
        assert len(query(settings, "SELECT * FROM sessions")) == 1

    def test_each_sign_in_is_its_own_session(self, app):
        with TestClient(app) as laptop:
            sign_up(laptop)
            phone = TestClient(app)
            phone.post("/api/auth/signin", json=credentials())
            laptop.post("/api/auth/signout")
            assert phone.get("/api/auth/me").status_code == 200

    def test_restart_forgets_everyone(self, settings: Settings):
        with TestClient(create_app(settings)) as client:
            token = sign_up(client).cookies[SESSION_COOKIE]
        with TestClient(create_app(settings)) as client:
            client.cookies.set(SESSION_COOKIE, token)
            assert client.get("/api/auth/me").status_code == 401
            assert client.post("/api/auth/signin", json=credentials()).status_code == 401


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/chat"),
        ("GET", "/api/documents"),
        ("GET", "/api/documents/abc"),
        ("DELETE", "/api/documents/abc"),
    ],
)
def test_signed_out_requests_are_401(client: TestClient, method, path):
    response = client.request(method, path, json={})
    assert response.status_code == 401
    assert response.json() == {"detail": "Please sign in to continue."}


def test_health_and_pages_need_no_session(client: TestClient):
    assert client.get("/api/health").status_code == 200
    assert client.get("/").status_code == 200
    assert client.get("/signup/").status_code == 200
