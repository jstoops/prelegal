"""FastAPI application: JSON API under /api, static frontend everywhere else."""

import logging
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from prelegal_backend.chat import ChatRequest, ChatResponse, run_chat
from prelegal_backend.config import Settings
from prelegal_backend.db import database_ok, reset_database
from prelegal_backend.documents import InvalidDocument, load_catalog
from prelegal_backend.llm import Complete, LlmError, LlmNotConfigured, litellm_complete

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, complete: Complete | None = None) -> FastAPI:
    """`complete` overrides the LLM call (for tests)."""
    settings = settings or Settings.from_env()
    complete = complete or litellm_complete(settings.openrouter_api_key)
    # Loaded up front, so a broken documents.json fails at startup.
    catalog = load_catalog(settings.documents_file)

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

    @app.post("/api/chat")
    def chat(request: ChatRequest) -> ChatResponse:
        # A sync route, so the blocking LLM call runs in the threadpool.
        try:
            request.data = catalog.normalize(request.data)
        except InvalidDocument as exc:
            raise HTTPException(422, str(exc)) from exc
        try:
            return run_chat(complete, catalog, request, request.today or date.today())
        except LlmNotConfigured as exc:
            logger.error("AI chat is unavailable: OPENROUTER_API_KEY is not set")
            raise HTTPException(503, "The AI assistant isn't configured.") from exc
        except LlmError as exc:
            logger.exception("AI chat failed")
            raise HTTPException(502, "The AI assistant is unavailable. Please try again.") from exc

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
