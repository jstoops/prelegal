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
| `PRELEGAL_DOCUMENTS_FILE` | `documents.json` | The document definitions (shared with the frontend). Loaded at startup, so a broken file fails fast. |
| `OPENROUTER_API_KEY` | none | Key for the AI chat. Without it, `/api/chat` answers 503. |

For local runs, the repo's `.env` file is loaded too. Variables already set in the environment take precedence, and an empty `OPENROUTER_API_KEY` deliberately disables the chat (the e2e tests do this).

## API

| Endpoint | Response |
| --- | --- |
| `GET /api/health` | `{"status": "ok", "database": "ok"}`, or status 503 if the database can't be opened. |
| `POST /api/chat` | One turn of the document chat. Stateless: the body is `{messages, data, today}`, i.e. the conversation so far (empty for the greeting), the current document as `{documentId, fields, parties}` (`documentId` is null until a document is chosen; missing fields get their defaults) and the user's local date. Returns `{reply, data}`: the assistant's message and the document with its updates applied. The document may be newly chosen or switched, with the parties and the values the user chose carried over. Errors are `{"detail": ...}`: 503 if no API key is set, 502 if the LLM fails, 422 for invalid requests (including unknown documents or fields and invalid values). |
| Any other `/api/...` | JSON `404`. |

## Layout

| Path | Purpose |
| --- | --- |
| `src/prelegal_backend/main.py` | `create_app()`: routes, the startup database reset and the static frontend. |
| `src/prelegal_backend/db.py` | Creates and checks the temporary SQLite database. |
| `src/prelegal_backend/config.py` | Settings from environment variables (and `.env`). |
| `src/prelegal_backend/llm.py` | Structured-output LLM calls: `openrouter/openai/gpt-oss-120b` on Cerebras, via LiteLLM. `create_app(complete=...)` swaps it for a fake in tests. |
| `src/prelegal_backend/documents.py` | Loads `documents.json`. Defines the `DocumentData` model (mirroring `frontend/lib/document.ts`), validates field values by kind, builds each document's structured-output schema, merges the LLM's updates (invalid values are ignored) and switches documents. |
| `src/prelegal_backend/chat.py` | The chat turn. While no document is chosen, the prompt lists the catalog: the assistant works out what the user needs, and for unsupported documents explains and offers the closest one. Once a document is chosen, the prompt lists its fields, the current values, the pre-filled terms for the user to confirm first, and what's still missing. When a turn picks or switches the document, the LLM is asked again with the new document's prompt. |
| `tests/` | pytest tests using FastAPI's `TestClient`. |
