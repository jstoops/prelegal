"""Structured-output LLM calls: gpt-oss-120b on Cerebras, via LiteLLM and OpenRouter."""

from typing import Protocol

from litellm import completion
from pydantic import BaseModel

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}
TIMEOUT_SECONDS = 30


class Complete(Protocol):
    """Sends chat messages and parses the reply into `response_model`.

    `create_app` takes one of these, so tests can pass a fake instead of the LLM.
    """

    def __call__[M: BaseModel](
        self, messages: list[dict[str, str]], response_model: type[M]
    ) -> M: ...


class LlmError(Exception):
    """The LLM call failed or returned something unusable."""


class LlmNotConfigured(LlmError):
    """No OpenRouter API key is set."""


def litellm_complete(api_key: str | None) -> Complete:
    """The real LLM call; raises `LlmNotConfigured` without an API key."""

    def complete[M: BaseModel](messages: list[dict[str, str]], response_model: type[M]) -> M:
        if not api_key:
            raise LlmNotConfigured("OPENROUTER_API_KEY is not set")
        try:
            response = completion(
                model=MODEL,
                messages=messages,
                response_format=response_model,
                reasoning_effort="low",
                extra_body=EXTRA_BODY,
                api_key=api_key,
                timeout=TIMEOUT_SECONDS,
            )
            return response_model.model_validate_json(response.choices[0].message.content)
        except Exception as exc:  # network, provider and parsing errors alike
            raise LlmError(str(exc)) from exc

    return complete
