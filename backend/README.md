# Prelegal backend

FastAPI app, managed with [uv](https://docs.astral.sh/uv/). It serves the JSON API under `/api` and the statically built frontend (`frontend/out`) everywhere else, so the whole product runs on one port.

```bash
uv run prelegal-backend   # http://localhost:8000
uv run pytest             # tests
```

On startup it deletes and recreates the SQLite database (users, sign-in sessions and saved documents), so a restart signs everyone out and loses all accounts and documents.

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
| `PRELEGAL_SESSION_DAYS` | `14` | How long a sign-in lasts. |
| `PRELEGAL_COOKIE_SECURE` | off | Set to `true` when served over HTTPS, so the session cookie is never sent over plain HTTP. |

For local runs, the repo's `.env` file is loaded too. Variables already set in the environment take precedence, and an empty `OPENROUTER_API_KEY` deliberately disables the chat (the e2e tests do this).

## API

| Endpoint | Response |
| --- | --- |
| `GET /api/health` | `{"status": "ok", "database": "ok"}`, or status 503 if the database can't be opened. |
| `POST /api/auth/signup` | Body `{email, password}` (a valid email; a password of 8 to 128 characters). Creates the account, signs in and returns `{email}` (201). 409 if the email is taken (in any letter case), 422 if invalid. |
| `POST /api/auth/signin` | Body `{email, password}`. Signs in and returns `{email}`, or 401 "Incorrect email or password." (the same for unknown emails). |
| `POST /api/auth/signout` | Ends the session and clears the cookie (204). |
| `GET /api/auth/me` | `{email}` of the signed-in user, or 401. |
| `GET /api/documents` | The user's saved documents, newest first: `{documents: [{id, documentId, title, updatedAt}]}`. |
| `GET /api/documents/{id}` | One saved document, adding its `data` and `messages`. 404 if it's missing or someone else's, 422 if it no longer fits `documents.json`. |
| `DELETE /api/documents/{id}` | Deletes a saved document (204), or 404. |
| `POST /api/chat` | One turn of the document chat. Stateless: the body is `{messages, data, today, savedId}`, i.e. the conversation so far (empty for the greeting), the current document as `{documentId, fields, parties}` (`documentId` is null until a document is chosen; missing fields get their defaults) and the user's local date. Returns `{reply, data, savedId}`: the assistant's message and the document with its updates applied. The document may be newly chosen or switched, with the parties and the values the user chose carried over. Once a document is chosen and the user has said something, each turn also saves it, with the conversation, to the user's documents: `savedId` is its id, which later turns send back to update it. Errors are `{"detail": ...}`: 503 if no API key is set, 502 if the LLM fails (nothing is saved), 404 for someone else's (or a deleted) `savedId`, 422 for invalid requests (including unknown documents or fields and invalid values, and conversations over 400 messages). Only the latest 40 messages are sent to the LLM. |
| | Everything except `/api/health` and sign up/in/out needs a session (the HttpOnly `prelegal_session` cookie), and answers 401 without one. |
| Any other `/api/...` | JSON `404`. |

## Layout

| Path | Purpose |
| --- | --- |
| `src/prelegal_backend/main.py` | `create_app()`: routes, the startup database reset and the static frontend. |
| `src/prelegal_backend/db.py` | Creates (with its schema), connects to and checks the temporary SQLite database. |
| `src/prelegal_backend/security.py` | Password hashing (stdlib scrypt) and session tokens (only their sha256 is stored). |
| `src/prelegal_backend/accounts.py` | Users and sessions, and the sign-up/sign-in request models. |
| `src/prelegal_backend/drafts.py` | Users' saved documents ("drafts" in code, to tell them apart from the catalog's documents). |
| `src/prelegal_backend/config.py` | Settings from environment variables (and `.env`). |
| `src/prelegal_backend/llm.py` | Structured-output LLM calls: `openrouter/openai/gpt-oss-120b` on Cerebras, via LiteLLM. `create_app(complete=...)` swaps it for a fake in tests. |
| `src/prelegal_backend/documents.py` | Loads `documents.json`. Defines the `DocumentData` model (mirroring `frontend/lib/document.ts`), validates field values by kind, builds each document's structured-output schema, merges the LLM's updates (invalid values are ignored) and switches documents. |
| `src/prelegal_backend/chat.py` | The chat turn. While no document is chosen, the prompt lists the catalog: the assistant works out what the user needs, and for unsupported documents explains and offers the closest one. Once a document is chosen, the prompt lists its fields, the current values, the pre-filled terms for the user to confirm first, and what's still missing. When a turn picks or switches the document, the LLM is asked again with the new document's prompt. |
| `tests/` | pytest tests using FastAPI's `TestClient`. |
