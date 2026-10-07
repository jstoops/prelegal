# prelegal
A platform for drafting common legal agreements

## Status

🚧 **Work in progress** — this project is under active development and is expected to be completed by **October 12, 2026**.

## Project layout

- `templates/` + `catalog.json`: Common Paper legal agreement templates (CC BY 4.0).
- `frontend/`: Next.js app, built as static files. It has a sign-in screen (fake for now), a dashboard of documents and the Mutual NDA creator. See [frontend/README.md](frontend/README.md).
- `backend/`: FastAPI app (a uv project). It serves the API under `/api` and the built frontend everywhere else. See [backend/README.md](backend/README.md).
- `scripts/`: start and stop the app in Docker.
- `Dockerfile`: builds the frontend and packages it with the backend in one image.

## Quick start

You need [Docker](https://docs.docker.com/get-docker/). Start the app with the script for your platform:

```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows (PowerShell)
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

Then open http://localhost:8000. Any email and password will sign you in.

The start script rebuilds the image and replaces any running container. The SQLite database is created from scratch on every start. If there is a `.env` file in the repo root (e.g. with `OPENROUTER_API_KEY`), it is passed to the container.

## Development

Run the frontend with hot reload (http://localhost:3000):

```bash
cd frontend
npm install
npm run dev
```

Run the backend serving your latest frontend build (http://localhost:8000). This needs [uv](https://docs.astral.sh/uv/):

```bash
cd frontend && npm run build
cd ../backend && uv run prelegal-backend
```

Tests: `uv run pytest` in `backend/`, and `npm test` / `npm run test:e2e` in `frontend/` (see [frontend/TESTING.md](frontend/TESTING.md)).
