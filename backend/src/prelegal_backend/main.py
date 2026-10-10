"""FastAPI application: JSON API under /api, static frontend everywhere else."""

import logging
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from prelegal_backend.accounts import (
    AccountResponse,
    Accounts,
    EmailTaken,
    SignInRequest,
    SignUpRequest,
    User,
)
from prelegal_backend.chat import ChatMessage, ChatRequest, ChatResponse, run_chat
from prelegal_backend.config import Settings
from prelegal_backend.db import database_ok, reset_database
from prelegal_backend.documents import InvalidDocument, load_catalog
from prelegal_backend.drafts import Draft, DraftList, DraftNotFound, Drafts
from prelegal_backend.llm import Complete, LlmError, LlmNotConfigured, litellm_complete

logger = logging.getLogger(__name__)

SESSION_COOKIE = "prelegal_session"


def create_app(settings: Settings | None = None, complete: Complete | None = None) -> FastAPI:
    """`complete` overrides the LLM call (for tests)."""
    settings = settings or Settings.from_env()
    complete = complete or litellm_complete(settings.openrouter_api_key)
    # Loaded up front, so a broken documents.json fails at startup.
    catalog = load_catalog(settings.documents_file)
    session_ttl = timedelta(days=settings.session_days)
    accounts = Accounts(settings.db_path, session_ttl)
    drafts = Drafts(settings.db_path, catalog)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        reset_database(settings.db_path)
        logger.info("Created a fresh database at %s", settings.db_path)
        yield

    app = FastAPI(title="Prelegal", lifespan=lifespan)

    @app.get("/api/health")
    def health() -> JSONResponse:
        ok = database_ok(settings.db_path)
        return JSONResponse(
            {"status": "ok" if ok else "error", "database": "ok" if ok else "unavailable"},
            status_code=200 if ok else 503,
        )

    # --- Accounts. The session cookie is HttpOnly and SameSite=Lax, and the API
    # only accepts JSON bodies, which other sites can't send without CORS
    # (there is none), so no separate CSRF token is needed.

    def current_user(
        token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    ) -> User:
        user = accounts.user_for_token(token) if token else None
        if user is None:
            raise HTTPException(401, "Please sign in to continue.")
        return user

    CurrentUser = Annotated[User, Depends(current_user)]
    # Shared by setting and deleting, which must match for the delete to work.
    cookie_flags = {"httponly": True, "samesite": "lax", "secure": settings.cookie_secure}

    def start_session(response: Response, user: User) -> AccountResponse:
        response.set_cookie(
            SESSION_COOKIE,
            accounts.start_session(user),
            max_age=int(session_ttl.total_seconds()),
            **cookie_flags,
        )
        return AccountResponse(email=user.email)

    @app.post("/api/auth/signup", status_code=201)
    def sign_up(request: SignUpRequest, response: Response) -> AccountResponse:
        try:
            user = accounts.create_user(request.email, request.password)
        except EmailTaken as exc:
            raise HTTPException(409, "An account with this email already exists.") from exc
        return start_session(response, user)

    @app.post("/api/auth/signin")
    def sign_in(request: SignInRequest, response: Response) -> AccountResponse:
        user = accounts.authenticate(request.email, request.password)
        if user is None:
            raise HTTPException(401, "Incorrect email or password.")
        return start_session(response, user)

    @app.post("/api/auth/signout", status_code=204)
    def sign_out(
        response: Response,
        token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    ) -> None:
        if token:
            accounts.end_session(token)
        response.delete_cookie(SESSION_COOKIE, **cookie_flags)

    @app.get("/api/auth/me")
    def me(user: CurrentUser) -> AccountResponse:
        return AccountResponse(email=user.email)

    # --- Saved documents. Another user's document is a 404, like a missing one.

    @app.get("/api/documents")
    def list_documents(user: CurrentUser) -> DraftList:
        return DraftList(documents=drafts.for_user(user.id))

    @app.get("/api/documents/{draft_id}")
    def get_document(draft_id: str, user: CurrentUser) -> Draft:
        try:
            return drafts.get(user.id, draft_id)
        except DraftNotFound as exc:
            raise HTTPException(404, "Document not found.") from exc
        except InvalidDocument as exc:
            raise HTTPException(422, "This document can no longer be opened.") from exc

    @app.delete("/api/documents/{draft_id}", status_code=204)
    def delete_document(draft_id: str, user: CurrentUser) -> None:
        try:
            drafts.delete(user.id, draft_id)
        except DraftNotFound as exc:
            raise HTTPException(404, "Document not found.") from exc

    # --- The AI chat. Each turn that has a document and a message from the user
    # saves it to the user's documents, with the conversation so far.

    @app.post("/api/chat")
    def chat(request: ChatRequest, user: CurrentUser) -> ChatResponse:
        # A sync route, so the blocking LLM call runs in the threadpool.
        try:
            request.data = catalog.normalize(request.data)
        except InvalidDocument as exc:
            raise HTTPException(422, str(exc)) from exc
        # Checked before the (slow, paid) LLM call.
        if request.saved_id is not None and not drafts.exists(user.id, request.saved_id):
            raise HTTPException(404, "Document not found.")
        try:
            response = run_chat(complete, catalog, request, request.today or date.today())
        except LlmNotConfigured as exc:
            logger.error("AI chat is unavailable: OPENROUTER_API_KEY is not set")
            raise HTTPException(503, "The AI assistant isn't configured.") from exc
        except LlmError as exc:
            logger.exception("AI chat failed")
            raise HTTPException(502, "The AI assistant is unavailable. Please try again.") from exc

        response.saved_id = request.saved_id
        # Not before the user has said anything, so just opening the creator
        # doesn't fill their list with empty drafts.
        if response.data.document_id and request.messages:
            messages = [*request.messages, ChatMessage(role="assistant", content=response.reply)]
            try:
                response.saved_id = drafts.save(user.id, request.saved_id, response.data, messages)
            except DraftNotFound as exc:  # deleted during the turn
                raise HTTPException(404, "Document not found.") from exc
        return response

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
