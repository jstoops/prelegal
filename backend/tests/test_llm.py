from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from prelegal_backend import llm
from prelegal_backend.llm import EXTRA_BODY, MODEL, LlmError, LlmNotConfigured, litellm_complete


class Answer(BaseModel):
    text: str


def fake_response(content: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


MESSAGES = [{"role": "user", "content": "Hi"}]


def test_calls_gpt_oss_on_cerebras_with_structured_output(monkeypatch):
    calls = []

    def completion(**kwargs):
        calls.append(kwargs)
        return fake_response('{"text": "Hello"}')

    monkeypatch.setattr(llm, "completion", completion)
    assert litellm_complete("key")(MESSAGES, Answer) == Answer(text="Hello")
    [kwargs] = calls
    assert kwargs["model"] == MODEL == "openrouter/openai/gpt-oss-120b"
    assert kwargs["extra_body"] == EXTRA_BODY == {"provider": {"order": ["cerebras"]}}
    assert kwargs["response_format"] is Answer
    assert kwargs["reasoning_effort"] == "low"
    assert kwargs["api_key"] == "key"
    assert kwargs["messages"] == MESSAGES


def test_missing_key_raises_not_configured(monkeypatch):
    monkeypatch.setattr(llm, "completion", lambda **_: pytest.fail("must not call the LLM"))
    with pytest.raises(LlmNotConfigured):
        litellm_complete(None)(MESSAGES, Answer)


@pytest.mark.parametrize("content", ["not json", '{"other": 1}', None])
def test_unusable_output_raises_llm_error(monkeypatch, content):
    monkeypatch.setattr(llm, "completion", lambda **_: fake_response(content))
    with pytest.raises(LlmError):
        litellm_complete("key")(MESSAGES, Answer)


def test_provider_errors_raise_llm_error(monkeypatch):
    def completion(**_):
        raise TimeoutError("timed out")

    monkeypatch.setattr(llm, "completion", completion)
    with pytest.raises(LlmError):
        litellm_complete("key")(MESSAGES, Answer)
