# Prelegal frontend

Next.js app for drafting legal agreements. It has sign-up and sign-in, a dashboard of the documents in `../documents.json`, **My documents**, and the **document creator**. There you chat with an AI assistant that works out which Common Paper agreement you need (or starts from the one you picked on the dashboard), confirms the pre-filled terms with you and fills in the rest. The agreement updates live, and you can download it as a PDF.

Accounts live in the backend: signing in sets an HttpOnly session cookie, which the page can't read, so on load the app asks `GET /api/auth/me` who is signed in. Documents are saved by the backend as you chat, and **My documents** lists them so you can pick a conversation back up. Every page, the creator, the preview and the PDF say that documents are drafts subject to legal review.

The app is built as a static export (`output: "export"`) into `out/`, which the FastAPI backend serves at http://localhost:8000. See the [root README](../README.md) to run the whole product in Docker.

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run dev` has no backend, so you can't sign in there (Next.js can't proxy `/api` in a static export). To use the app, build and run the whole product on http://localhost:8000 (`npm run build`, then `uv run prelegal-backend` in `backend/`, or the Docker start scripts), with `OPENROUTER_API_KEY` in the repo's `.env`.

Other scripts: `npm run build` (static export to `out/`), `npm run lint`, `npm test` (unit and component tests) and `npm run test:e2e` (Playwright against the FastAPI backend, which needs [uv](https://docs.astral.sh/uv/) and `npx playwright install chromium` once). See [TESTING.md](TESTING.md) for test coverage and the manual test plan.

> Run commands from the `frontend/` directory. The document definitions and templates are read at build time from the repo's `../documents.json` and `../templates/` folder (resolved relative to the working directory).

## How it works

| Path | Purpose |
| --- | --- |
| `app/layout.tsx` | Root layout: the `AuthProvider` (`lib/auth.tsx`) and the site footer with the draft disclaimer (`components/SiteFooter.tsx`). |
| `app/page.tsx`, `app/signup/page.tsx` | `/` and `/signup/`: sign in and create an account (`components/AuthForm.tsx` in `components/AuthLayout.tsx`). Signed-in users are sent on to `/app/`. |
| `app/app/layout.tsx` | Layout for the signed-in pages: `components/AuthGate.tsx` (signed-out visitors go to `/`; until the session is known only a loading state shows) and the app header (`components/AppHeader.tsx`) with navigation, the user's email and Sign out. |
| `app/app/page.tsx` | `/app/`: "New document". Recent saved documents, then every document (`components/DocumentList.tsx`). Each **Create** button opens the creator with that document chosen, and **Ask the assistant** opens it without one. |
| `app/app/documents/page.tsx` | `/app/documents/`: My documents, to open or delete saved documents (`components/SavedDocumentList.tsx`). |
| `app/app/create/page.tsx` | `/app/create/`, `/app/create/?doc=<id>` and `/app/create/?id=<saved id>`: Server Component; loads every document and its parsed template. `components/CreatorFromUrl.tsx` reads the URL in the browser (the page is a static export): `?id=` loads a saved document to continue, `?doc=` preselects a new one. |
| `app/not-found.tsx` | The 404 page (`out/404.html`, also served by the backend). |
| `lib/catalog.ts` | Reads `documents.json` and, for the creator, each document's intro, attribution and parsed Standard Terms (server-only). |
| `lib/api.ts` | The shared API client (`apiFetch`, `ApiError`). A 401 signs the user out, except where it's an expected answer such as a wrong password. |
| `lib/auth.tsx` | `AuthProvider` and `useAuth`: who is signed in, and sign in, sign up and sign out. |
| `lib/drafts.ts` | Client for the saved documents (`/api/documents`). |
| `lib/styles.ts` | Shared input and button classes. Colors are tokens in `app/globals.css`. |
| `scripts/fix-export-segments.mjs` | Runs after `next build` to work around a Windows-only Next.js export bug that breaks link prefetching (see the comment in the file). |
| `lib/template.ts` | Parses a Standard Terms template into numbered clauses (1., 1.1, (a), (i)) with headings, bold, links and Cover Page term references (server-only). Parsing is strict: unknown markup or structure fails the build instead of silently dropping text. |
| `lib/document.ts` | The `DocumentDefinition` and `DocumentData` types (mirroring the backend), defaults, and the derived Cover Page content (sections, party table, PDF file name) shared by the preview and the PDF. |
| `components/DocumentCreator.tsx` | Client container: the document state (none until one is chosen; dates show today until the assistant sets them, or a saved document's), the draft disclaimer, "Saved to My documents", layout, PDF download. It follows the assistant when it picks or switches the document. |
| `components/DocumentChat.tsx` | The AI chat: asks the backend for a greeting on load (or shows a saved conversation), sends each message with the conversation, the current document and its saved id, and passes the updated document up. Shows errors with a Retry button. |
| `lib/chat.ts` | Client for `POST /api/chat` (same origin). The backend saves the document with each turn once one is chosen and returns its id. |
| `components/DocumentPreview.tsx` | HTML rendering of the document: Cover Page, signature table and Standard Terms. |
| `components/DocumentPdf.tsx` | `@react-pdf/renderer` version of the document, lazy-loaded on download. |

Signature and date rows are intentionally left blank for the parties to sign.

Known limitation: the PDF uses the standard PDF fonts, so non-Latin scripts (CJK, Cyrillic, Greek) don't render in the downloaded file.

The agreement texts are © Common Paper, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Only the Mutual NDA's template has its own Cover Page and attribution lines; the other Cover Pages are built from `documents.json`, each with a CC BY 4.0 attribution.
