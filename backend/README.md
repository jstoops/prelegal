# Prelegal backend

FastAPI app, managed with [uv](https://docs.astral.sh/uv/). It serves the JSON API under `/api` and the statically built frontend (`frontend/out`) everywhere else, so the whole product runs on one port.

```bash
uv run prelegal-backend   # http://localhost:8000
uv run pytest             # tests
```

On startup it deletes and recreates an empty SQLite database. There are no tables yet; they will come with the features that need them, such as real sign-up and sign-in.

## Configuration

Environment variables (the Docker image sets the container paths):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRELEGAL_HOST` | `127.0.0.1` | Interface to listen on (`0.0.0.0` in Docker). |
| `PRELEGAL_PORT` | `8000` | Port to listen on. |
| `PRELEGAL_DB_PATH` | `backend/data/prelegal.db` | SQLite file, recreated on every start. |
| `PRELEGAL_STATIC_DIR` | `frontend/out` | Frontend build to serve. If it's missing, only the API is served. |
| `OPENROUTER_API_KEY` | none | Key for the AI chat. Without it, `/api/chat` answers 503. |

For local runs, the repo's `.env` file is loaded too. Variables already set in the environment take precedence, and an empty `OPENROUTER_API_KEY` deliberately disables the chat (the e2e tests do this).

## API

| Endpoint | Response |
| --- | --- |
| `GET /api/health` | `{"status": "ok", "database": "ok"}`, or status 503 if the database can't be opened. |
| `POST /api/chat` | One turn of the Mutual NDA chat. Stateless: the body is `{messages, data, today}` (the conversation so far, empty for the greeting; the current `NdaData` in camelCase; the user's local date). Returns `{reply, data}`, the assistant's message and the NDA with its updates applied. Errors are `{"detail": ...}`: 503 if no API key is set, 502 if the LLM fails, 422 for invalid requests. |
| Any other `/api/...` | JSON `404`. |

## Layout

| Path | Purpose |
| --- | --- |
| `src/prelegal_backend/main.py` | `create_app()`: routes, the startup database reset and the static frontend. |
| `src/prelegal_backend/db.py` | Creates and checks the temporary SQLite database. |
| `src/prelegal_backend/config.py` | Settings from environment variables (and `.env`). |
| `src/prelegal_backend/llm.py` | Structured-output LLM calls: `openrouter/openai/gpt-oss-120b` on Cerebras, via LiteLLM. `create_app(complete=...)` swaps it for a fake in tests. |
| `src/prelegal_backend/nda.py` | The NDA chat: the `NdaData` model (mirroring `frontend/lib/nda.ts`), the LLM output schema, the system prompt, and merging the LLM's updates (invalid values are ignored). |
| `tests/` | pytest tests using FastAPI's `TestClient`. |
