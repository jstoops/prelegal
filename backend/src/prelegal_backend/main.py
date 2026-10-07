"""FastAPI application: JSON API under /api, static frontend everywhere else."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from prelegal_backend.config import Settings
from prelegal_backend.db import database_ok, reset_database

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        reset_database(settings.db_path)
        logger.info("Created empty database at %s", settings.db_path)
        yield

    app = FastAPI(title="Prelegal", lifespan=lifespan)

    @app.get("/api/health")
    def health() -> JSONResponse:
        ok = database_ok(settings.db_path)
        return JSONResponse(
            {"status": "ok" if ok else "error", "database": "ok" if ok else "unavailable"},
            status_code=200 if ok else 503,
        )

    # Unknown API paths get a JSON 404 instead of the frontend's 404 page.
    @app.api_route(
        "/api/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    )
    def api_not_found(path: str) -> JSONResponse:
        return JSONResponse({"detail": "Not Found"}, status_code=404)

    if settings.static_dir.is_dir():
        # html=True serves index.html for directories and 404.html for misses.
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    else:
        logger.warning(
            "Frontend build not found at %s; serving the API only. "
            "Run `npm run build` in frontend/.",
            settings.static_dir,
        )

    return app
