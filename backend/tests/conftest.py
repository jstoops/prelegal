from pathlib import Path
from typing import get_args

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from prelegal_backend.config import Settings
from prelegal_backend.main import create_app


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """A minimal stand-in for the Next.js static export."""
    out = tmp_path / "out"
    (out / "app" / "create").mkdir(parents=True)
    (out / "signup").mkdir()
    (out / "index.html").write_text("<h1>Sign in</h1>")
    (out / "signup" / "index.html").write_text("<h1>Create your account</h1>")
    (out / "app" / "index.html").write_text("<h1>Dashboard</h1>")
    (out / "app" / "create" / "index.html").write_text("<h1>Creator</h1>")
    (out / "404.html").write_text("<h1>Page not found</h1>")
    return out


@pytest.fixture
def settings(tmp_path: Path, static_dir: Path) -> Settings:
    return Settings(db_path=tmp_path / "data" / "prelegal.db", static_dir=static_dir)


@pytest.fixture
def client(settings: Settings):
    """A signed-out client. Entering the context runs the lifespan, which
    creates the database."""
    with TestClient(create_app(settings)) as client:
        yield client


PASSWORD = "correct horse battery"


def sign_up(client: TestClient, email: str = "alice@example.com") -> TestClient:
    """Signs `client` up (and so in): it keeps the session cookie."""
    response = client.post("/api/auth/signup", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    return client


def _model_in(annotation) -> type[BaseModel] | None:
    """The model in an annotation such as `PartyUpdates | None`, if any."""
    for t in (annotation, *get_args(annotation)):
        if isinstance(t, type) and issubclass(t, BaseModel):
            return t
    return None


def with_nulls(model: type[BaseModel], data: dict) -> dict:
    """`data` with null for every field of `model` it leaves out, as the LLM's
    strict structured output would have. Required nested models (`updates`) are
    filled in the same way."""
    result = {}
    for name, field in model.model_fields.items():
        key = field.alias or name
        value = data.get(key)
        nested = _model_in(field.annotation)
        if nested and (value is not None or field.annotation is nested):
            value = with_nulls(nested, value or {})
        result[key] = value
    return result


class FakeLlm:
    """Stands in for the LLM: records each call and returns canned outputs in turn
    (the last one repeats). Outputs leave out the fields that stay null."""

    def __init__(self) -> None:
        self.calls: list[list[dict[str, str]]] = []
        self.models: list[type[BaseModel]] = []
        self.outputs: list[dict] = [{"reply": "Hello!"}]
        self.error: Exception | None = None

    def __call__(self, messages, response_model):
        self.calls.append(messages)
        self.models.append(response_model)
        if self.error:
            raise self.error
        output = self.outputs[min(len(self.calls), len(self.outputs)) - 1]
        return response_model.model_validate(with_nulls(response_model, output))

    @property
    def prompts(self) -> list[str]:
        return [messages[0]["content"] for messages in self.calls]


@pytest.fixture
def fake_llm() -> FakeLlm:
    return FakeLlm()


@pytest.fixture
def app(settings: Settings, fake_llm: FakeLlm):
    return create_app(settings, complete=fake_llm)


@pytest.fixture
def chat_client(app):
    """Signed in as alice@example.com, with the fake LLM."""
    with TestClient(app) as client:
        yield sign_up(client)


@pytest.fixture
def other_client(app, chat_client: TestClient):
    """Signed in as bob@example.com, on the same app. Not entered as a context,
    as that would rerun the lifespan and reset the database."""
    return sign_up(TestClient(app), "bob@example.com")
