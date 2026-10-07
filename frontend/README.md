# Prelegal frontend

Next.js app for drafting legal agreements. It has a sign-in screen, a dashboard of the documents in `catalog.json`, and the **Mutual NDA Creator**: fill in the key terms in a form, see the Common Paper Mutual NDA update live, and download the completed agreement as a PDF.

Sign-in is fake for now (PL-4): any email and password are accepted, and the email is kept in `sessionStorage` to show in the header. Nothing is sent to the backend.

The app is built as a static export (`output: "export"`) into `out/`, which the FastAPI backend serves at http://localhost:8000. See the [root README](../README.md) to run the whole product in Docker.

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build` (static export to `out/`), `npm run lint`, `npm test` (unit and component tests) and `npm run test:e2e` (Playwright against the FastAPI backend, which needs [uv](https://docs.astral.sh/uv/) and `npx playwright install chromium` once). See [TESTING.md](TESTING.md) for test coverage and the manual test plan.

> Run commands from the `frontend/` directory. The NDA text and the catalog are read at build time from the repo's `../templates/` folder and `../catalog.json` (resolved relative to the working directory).

## How it works

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | `/`: the fake sign-in screen (`components/LoginForm.tsx`). |
| `app/app/layout.tsx` | Layout for the signed-in pages: the app header (`components/AppHeader.tsx`) with the user's email and Sign out. |
| `app/app/page.tsx` | `/app/`: dashboard listing the catalog's documents (`components/DocumentList.tsx`). Only the Mutual NDA can be created so far; the rest show "Coming soon". |
| `app/app/nda/page.tsx` | `/app/nda/`: Server Component; loads the NDA template and renders the creator. |
| `app/not-found.tsx` | The 404 page (`out/404.html`, also served by the backend). |
| `lib/catalog.ts` | Reads `catalog.json` and merges multi-part documents (Cover Page + Standard Terms) into one entry (server-only). |
| `lib/session.ts` | The fake session: the signed-in email in `sessionStorage`. |
| `lib/styles.ts` | Shared input and button classes. Colors are tokens in `app/globals.css`. |
| `scripts/fix-export-segments.mjs` | Runs after `next build` to work around a Windows-only Next.js export bug that breaks link prefetching (see the comment in the file). |
| `lib/nda-template.ts` | Reads `templates/Mutual-NDA-coverpage.md` and `templates/Mutual-NDA.md` and parses them into structured, serializable content (server-only). Parsing is strict: if the template structure changes unexpectedly, the build fails instead of silently dropping text. |
| `lib/nda.ts` | `NdaData` model, defaults, and derived cover-page content shared by the preview and the PDF. |
| `components/NdaCreator.tsx` | Client container: form state, layout, PDF download. |
| `components/NdaForm.tsx` | Form inputs for agreement terms and both parties. |
| `components/NdaPreview.tsx` | HTML rendering of the completed NDA. |
| `components/NdaPdfDocument.tsx` | `@react-pdf/renderer` version of the NDA, lazy-loaded on download. |

Signature and date rows are intentionally left blank for the parties to sign.

Known limitation: the PDF uses the standard PDF fonts, so non-Latin scripts (CJK, Cyrillic, Greek) don't render in the downloaded file.

The Mutual NDA text is © Common Paper, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
