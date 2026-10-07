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

## API

| Endpoint | Response |
| --- | --- |
| `GET /api/health` | `{"status": "ok", "database": "ok"}`, or status 503 if the database can't be opened. |
| Any other `/api/...` | JSON `404`. |

## Layout

| Path | Purpose |
| --- | --- |
| `src/prelegal_backend/main.py` | `create_app()`: routes, the startup database reset and the static frontend. |
| `src/prelegal_backend/db.py` | Creates and checks the temporary SQLite database. |
| `src/prelegal_backend/config.py` | Settings from environment variables. |
| `tests/` | pytest tests using FastAPI's `TestClient`. |
