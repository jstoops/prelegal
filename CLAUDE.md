# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.

The user can carry out AI chat in order to establish what document they want and how to fill in the fields.

The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

All 11 documents can be created by chatting with an AI assistant. It works out which one the user needs, or offers the closest one for unsupported requests, and fills it in. Users sign up and sign in, and their documents are saved as they chat so they can come back to them. See "Implementation status" below.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
The frontend is a Next.js static export (`frontend/out`), served by FastAPI alongside the API.  
There should be scripts in scripts/ for:

```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

Backend available at http://localhost:8000

## Color Scheme
- Accent White: `#ffffff`
- Orange Primary: `#bd5d38`
- Orange Primary Hover: `#9f4e2f` (buttons)
- Raven Secondary: `#6c757d`
- Raven Secondary Hover: `#5a6268` (buttons)
- Dark Gray: `#343a40` (headings)
- Gray Text: `#6c757d`

White on Orange Primary is 4.4:1, below WCAG AA (4.5:1), so primary buttons rest on `#9f4e2f` and darken to `#85412a` on hover. Orange Primary is used for accents, borders and focus rings. The colors are Tailwind tokens in `frontend/app/globals.css` (`brand`, `brand-strong`, `brand-stronger`, `brand-light` for text on dark backgrounds, `raven`, `raven-hover`, `heading`), and shared button/input classes are in `frontend/lib/styles.ts`.

## Implementation status

- **PL-2:** Common Paper templates in `templates/`, listed in `catalog.json`.
- **PL-3:** Mutual NDA creator: a live preview and a PDF download (`@react-pdf/renderer`). Non-Latin scripts don't render in the PDF yet. (Its form was replaced by the AI chat in PL-5.)
- **PL-4:** V1 foundation:
  - **Backend:** FastAPI (`backend/src/prelegal_backend/`). On startup it recreates an empty SQLite database (no tables yet; PL-7 added the schema). `GET /api/health` reports status, unknown `/api/*` paths return JSON 404s, and everything else is the static frontend. Settings come from `PRELEGAL_HOST`, `PRELEGAL_PORT`, `PRELEGAL_DB_PATH` and `PRELEGAL_STATIC_DIR` (plus `OPENROUTER_API_KEY` since PL-5).
  - **Frontend routes:** `/` is a fake sign-in (any credentials; the email is kept in `sessionStorage` via `lib/session.ts`, with no backend call). `/app/` is a dashboard built from `catalog.json` (only the Mutual NDA is creatable). `/app/nda/` is the NDA creator. Signed-in pages share an app header with Sign out. (In PL-6 the dashboard moved to `documents.json` and the creator to `/app/create/`. PL-7 replaced the fake sign-in with real accounts.)
  - **Docker:** a multi-stage `Dockerfile` (Node build, then Python 3.12 + uv) running as non-root, with a health check. The `scripts/` start scripts rebuild the image, replace the container and pass `.env` through.
  - **Windows build workaround:** `frontend/scripts/fix-export-segments.mjs` runs after `next build` to fix a Windows-only Next.js export bug. On Linux it does nothing.
- **PL-5:** AI chat replaces the NDA form:
  - **Backend:** `POST /api/chat` is stateless. Each turn sends `{messages, data, today}` (the conversation so far, empty for the greeting; the current `NdaData` in camelCase; the user's local date) and returns `{reply, data}` (the NDA with the AI's updates applied). `llm.py` calls gpt-oss-120b on Cerebras with a structured-output schema, where every field is required and nullable and null means "unchanged". `nda.py` holds the models, the system prompt and the merge, which ignores invalid values. Messages and NDA text fields are length-capped, since the whole NDA goes into every prompt. The prompt includes the still-missing fields and a two-week calendar for relative dates. Errors: 503 with no key, 502 if the LLM fails.
  - **Config:** `Settings.from_env()` loads the repo's `.env` for local runs, and real environment variables take precedence. `create_app(settings, complete=...)` takes a fake LLM in tests.
  - **Frontend:** `NdaChat` (in the left panel of `NdaCreator`) requests an LLM greeting on load and keeps the conversation in memory. `lib/chat.ts` is the API client. The Effective Date shows today until the AI sets one. `NdaForm` was removed. (In PL-6, `nda.py` and the `Nda*` components were replaced by generic equivalents, and `/api/chat` data became `{documentId, fields, parties}`; the rest of this flow is unchanged.)
  - **Tests:** the automated tests never call the real LLM. Playwright mocks `/api/chat` with `page.route`, and its server runs with an empty `OPENROUTER_API_KEY`.
- **PL-6** (merged in PR #8): All documents in the catalog, through one generic engine (the NDA was migrated onto it):
  - **`documents.json`** (repo root, read by both backend and frontend) defines each document. That covers its id, name, description, Standard Terms file, party roles (e.g. Provider/Customer), cover-page intro, signing statement, CC BY attribution, PDF slug, and curated Cover Page `fields`. Field kinds are text, longtext, date (blank means today), years and choice. A choice option can embed a years field as `{key}`, and fields with the same `section` share one heading. Optional fields can set `emptyText`, and every field has `guidance` for the LLM. Only the NDA template has a cover page in `templates/`; the others' cover pages are built from these fields. Tests check it covers every `catalog.json` template.
  - **Backend:** `documents.py` (definitions, validation, merge, document switching, a per-document structured-output model via `create_model`) and `chat.py` (prompt and turn) replace `nda.py`. `/api/chat` data is `{documentId, fields, parties}` with `documentId: null` until chosen. The request is normalized (unknown documents/fields or invalid values → 422; missing fields → defaults). The no-document prompt lists the catalog and handles unsupported requests by offering the closest document. The fill prompt lists the fields, the pre-filled terms (which the assistant must confirm with the user in its first questions), and the missing fields by party role. If a turn picks or switches the document, the LLM is called again with the new document's prompt. Switching carries over the parties and any user-changed values with matching keys. `PRELEGAL_DOCUMENTS_FILE` overrides the path (Docker sets it).
  - **Frontend:** `/app/create/` is the one creator (`/app/nda/` was removed). `?doc=<id>` preselects a document and is read client-side in `CreatorFromUrl` under `<Suspense>`. Without it the chat picks one. Dashboard cards all have Create, plus "Ask the assistant". The creator's toolbar has an "← All documents" link back to the dashboard (arrow only on phones, labelled "Back to all documents"). `lib/template.ts` parses all templates into nested clauses (1., 1.1, (a), (i)) and is strict. `lib/document.ts` holds the shared model and cover-page helpers. `DocumentCreator`/`DocumentChat`/`DocumentPreview`/`DocumentPdf` replace the `Nda*` components.
- **PL-7** (merged in PR #9): Accounts, saved documents, a draft disclaimer and polish:
  - **Database** (`db.py`): `users`, `sessions` and `documents` tables, recreated empty on every start (so restarting signs everyone out and loses all documents). `connect()` gives a per-request connection (foreign keys on, commit or rollback). Timestamps are UTC ISO strings with microseconds, so they sort as text.
  - **Accounts** (`security.py`, `accounts.py`): stdlib scrypt password hashes, emails trimmed and lowercased, passwords 8–128 characters. A session is a random token in the HttpOnly, SameSite=Lax `prelegal_session` cookie, and only its sha256 is stored. Sessions last `PRELEGAL_SESSION_DAYS` (default 14). `PRELEGAL_COOKIE_SECURE=true` adds `Secure` (off by default for http://localhost). Endpoints: `POST /api/auth/signup` (201, 409 if taken), `/signin` (401 "Incorrect email or password." either way), `/signout` (204), `GET /api/auth/me`. The `current_user` dependency (401 "Please sign in to continue.") guards `/api/chat` and `/api/documents*`. Validators' messages ("Enter a valid email address.") are shown to users.
  - **Saved documents** (`drafts.py`, called "drafts" in code to avoid a clash with the catalog): saved by `/api/chat` itself. The request takes an optional `savedId`, and the response returns it. A turn saves once a document is chosen and the user has said something (not the greeting), storing the data and the whole conversation including the reply. So that long and resumed conversations keep working, a request may carry up to 400 messages (`MAX_MESSAGES`; beyond that a plain "too long" message), but only the latest 40 (`LLM_HISTORY`) go to the LLM. If the saved copy was deleted elsewhere, the chat's next turn gets a 404 and `DocumentChat` drops the id, so Retry saves a new copy. Ids are random hex. `GET /api/documents` (`{documents: [{id, documentId, title, updatedAt}]}`, newest first), `GET /api/documents/{id}` (adds `data` and `messages`, and returns 422 if it no longer fits `documents.json`), and `DELETE`. Another user's document is a 404, checked before the LLM is called.
  - **Frontend auth:** `lib/api.ts` (`apiFetch`, `ApiError`) is the shared client; a 401 signs the user out, unless the call passes `sessionRequired: false`. `lib/auth.tsx` has `AuthProvider`/`useAuth`, in the root layout, which checks `/api/auth/me` on load. `components/AuthGate.tsx` (`require="user"` on `/app/*`, `"guest"` on `/` and `/signup/`) shows only a loading state until the session is known, then redirects with `router.replace`. `lib/session.ts` and `LoginForm` were removed in favour of `AuthForm` (sign in and sign up) inside `AuthLayout`.
  - **Frontend documents:** `lib/drafts.ts` is the client. `/app/documents/` (My documents) lists them with Open and Delete (`SavedDocumentList`), and the dashboard (now titled "New document") shows the latest three as "Recent documents". `/app/create/?id=<savedId>` reopens one (`CreatorFromUrl` loads it, then `DocumentCreator saved=...`), and `DocumentChat` resumes the stored conversation without a greeting and keeps the saved id for later turns. The URL isn't changed after the first save, so reloading a new document's page starts afresh (the work is in My documents).
  - **LLM fixes:**
    - `llm.py` passes `allowed_openai_params=["reasoning_effort"]`. LiteLLM checks parameters against a model map it downloads at startup, and that map (unlike the one bundled with 1.104.0) says OpenRouter's gpt-oss doesn't take `reasoning_effort`, so the call was refused.
    - `tidy()` in `documents.py` undoes the model's slips in text values, both in its updates and when normalizing incoming or saved data:
      - Placeholder text (`null`, `undefined`, anything in `[brackets]` such as `"[null]"`) means "not given". `"None"` is kept, since it can mean "no modifications".
      - Text wrapped in quotes is unwrapped, so `'""'` becomes empty.
      - The output schema also tells the model to use JSON null.
  - **Disclaimer:** `DRAFT_DISCLAIMER` in `lib/document.ts` appears in the site footer (`SiteFooter`, every page), an amber banner above the preview in the creator, the top of the preview, and a fixed footer on every PDF page (drawn last, in the bottom padding). The banner is beside the chat column, not above it, so it doesn't push the chat down. On desktop the chat column is `calc(100dvh - 11rem)` tall (header, toolbar and padding), keeping the message box in view (checked by e2e at 1024x768 to 1920x1080).
  - **Polish:** the header has New document / My documents navigation, and the sign-in pages have a product panel. Blank cover-page fields still show bracketed placeholders such as `[Governing Law]` by design, while blank party cells stay empty. Extra Tailwind token `brand-light` (`#e8a283`, for text on dark backgrounds). Extra shared classes in `lib/styles.ts` (`outlineButtonClass`, `cardClass`, `linkClass`, `alertClass`). `text-raven` fails AA on the slate-50 page background, so use it on white or use `text-slate-600`.
  - **Tests:** the e2e tests sign up through the API (`tests/e2e/helpers.ts`) with a unique email each time, since the e2e database can outlive a run. Because `/api/chat` is mocked in the browser, real saving is covered by pytest, and `history.spec.ts` mocks the saved-documents API too.
- **Not yet built:** rate limiting (sign-in, sign-up and `/api/chat`), password reset and email verification, persistence across restarts, and renaming saved documents.

## Testing

- Backend: `uv run pytest` in `backend/`.
- Frontend: `npm test` (Vitest) and `npm run lint` in `frontend/`.
- E2E: `npm run test:e2e` builds the frontend and runs Playwright against the real FastAPI server on port 3100. It needs `uv` on the PATH.
- Test coverage and the manual test plan are in `frontend/TESTING.md`.
