# Testing the Prelegal frontend

## Automated tests

Run from `frontend/`:

| Command | What it runs | Time |
| --- | --- | --- |
| `npm test` | Unit and component tests (Vitest + Testing Library, jsdom). | ~5 s |
| `npm run test:watch` | The same, in watch mode. | |
| `npm run test:e2e` | End-to-end tests in Chromium (Playwright) against what users get: the static build served by the real FastAPI backend (`npm run build`, then `uv run prelegal-backend` on port 3100). Needs [uv](https://docs.astral.sh/uv/) on the PATH, and `npx playwright install chromium` once beforehand. | ~1 min |
| `npm run lint` / `npx tsc --noEmit` | Static checks. Test files are included. | |
| `uv run pytest` (in `backend/`) | Backend tests: database reset, health check, API 404s, static file serving, settings, and the AI chat with a fake LLM (prompt contents, merging updates, ignoring invalid values, errors, request validation, a strict-mode-friendly schema). | ~1 s |

### Coverage

| File | Covers |
| --- | --- |
| `tests/unit/nda.test.ts` | Model helpers: defaults, date formatting (including years 0–99), placeholders, cover page sections, party rows, PDF filename sanitizing (unsafe characters, accents, non-Latin text, length cap). |
| `tests/unit/nda-template.test.ts` | Template parser. Checks the real repo templates word-for-word against the source markdown, including term references, bold and links. Checks the CC BY attributions, CRLF line endings, and rejection of malformed templates (missing attribution, missing intro, wrapped lines, no sections). Also checks loading and JSON serializability. |
| `tests/unit/chat.test.ts` | The `/api/chat` client: request body (history, NDA, local date), server error messages, generic messages for validation errors, non-JSON and malformed replies, network failures, aborts. |
| `tests/unit/NdaChat.test.tsx` | Greeting on load (once, even in strict mode), sending with Enter or the Send button, Shift+Enter for new lines, blank messages ignored, no sending while waiting, the latest NDA sent, screen-reader labels for who said what, errors with Retry (including a failed greeting). |
| `tests/unit/NdaPreview.test.tsx` | Heading structure, all 11 standard terms, links (https, new tab), filled values, checkbox markers, party table, signature row height, placeholders, user input rendered as text and never as HTML. |
| `tests/unit/NdaCreator.test.tsx` | The chat updating the live preview (via a fake `/api/chat`), the updated NDA sent with the next message, the effective date (today until the assistant sets one, and today again if it's cleared), the PDF download flow (data passed, filename, object URL lifecycle), the progress and busy state, error reporting and retry, and the status region. |
| `tests/unit/NdaPdfDocument.test.tsx` | Renders the **real PDF** and extracts its text. Checks metadata, the cover page fitting on page 1, every value, option marks, the standard terms word-for-word, attributions, no hyphenation, placeholders, special characters, long text flowing to new pages (never clipped), and the signature table never splitting. |
| `tests/unit/session.test.ts` | Fake session: signed out by default, sign in (email trimmed), sign out, subscribers updated, blocked storage doesn't break sign-in. |
| `tests/unit/catalog.test.ts` | Catalog loader: the NDA's Cover Page and Standard Terms merge into one document, only the NDA links to a creator, and a missing NDA entry fails the build. Checks the real `catalog.json`. |
| `tests/unit/LoginForm.test.tsx` | Labelled fields, any credentials sign in and go to `/app/`, Enter submits, both fields required. |
| `tests/unit/AppHeader.test.tsx` | Banner with brand link to the dashboard, the signed-in email, and Sign out returning to `/`. |
| `tests/unit/DocumentList.test.tsx` | Document cards, the Create link for available documents, and "Coming soon" without links for the rest. |
| `tests/unit/fix-export-segments.test.ts` | The postbuild fix flattens nested segment folders (Windows) and leaves a correct export (Linux/macOS) untouched. |
| `tests/e2e/platform.spec.ts` | Real browser against FastAPI. Health check (database reachable), JSON 404s for unknown API paths, the 404 page, sign-in (title, required fields, no console errors, axe scan), dashboard (11 documents, only the NDA creatable, axe scan), navigating to the NDA and back, sign out, trailing-slash redirects, and phone layouts with a long email. |
| `tests/e2e/nda-creator.spec.ts` | Real browser, production build, at `/app/nda/`. Checks: no console errors or hydration warnings; the date defaults to today in the browser's time zone; an axe-core WCAG 2.1 AA scan; a scripted chat (`/api/chat` mocked in the browser) filling every field of the preview; the request contents; errors and Retry; the real backend's "not configured" error (the e2e server runs with an empty `OPENROUTER_API_KEY`, so tests never call the real LLM); links opening in a new tab; **actual PDF downloads**, which are parsed and checked; keyboard-only download; the PDF library loading only on demand; and the phone layout. |

Known gaps: non-Latin scripts in the PDF are a `todo` test. They need an embedded Unicode font. The real LLM is never called by automated tests, so check the chat's behaviour with the manual test plan (section 2).

## Manual test plan

Run this before a release, or after changing the layout, the PDF, or the templates. Use the Docker start script for your platform (see the root README), with `OPENROUTER_API_KEY` in the repo's `.env`, and open http://localhost:8000. Tick each item in at least **Chrome, Firefox and Safari**. Automated tests cover only Chromium.

### 0. Sign in and dashboard

- [ ] `/` shows the Sign in screen. Submitting with an empty field shows the browser's "required" message.
- [ ] Any email and password sign you in and open the dashboard at `/app/`, with your email in the header.
- [ ] The dashboard lists 11 documents. Only Mutual Non-Disclosure Agreement has a **Create** button; the others say "Coming soon".
- [ ] **Create** opens the Mutual NDA Creator at `/app/nda/`. Clicking **Prelegal** in the header returns to the dashboard.
- [ ] **Sign out** returns to `/`, and the dashboard no longer shows your email.
- [ ] An unknown URL (e.g. `/nope/`) shows "Page not found" with a link back to the documents.
- [ ] http://localhost:8000/api/health returns `{"status":"ok","database":"ok"}`.
- [ ] Stopping and starting the app again with the scripts works, and the start script reports it is running.

### 1. First load

- [ ] The NDA creator (`/app/nda/`) loads with the chat on the left and the NDA preview on the right (stacked on narrow screens).
- [ ] "Assistant is typing…" shows briefly, then the assistant greets you and asks its first question.
- [ ] The preview shows **today's date** as the Effective Date, e.g. "October 5, 2026".
- [ ] The defaults show: the Purpose text, 1-year MNDA term, and 1-year confidentiality.
- [ ] Blank fields show bracketed placeholders in the preview, e.g. "Governing Law: [Governing Law]".
- [ ] The browser console has no errors.

### 2. AI chat and live preview

- [ ] Answer the assistant's questions. After each reply the preview shows the new values, and the assistant confirms what it filled in and asks about the next missing field.
- [ ] Give several details in one message, e.g. "Acme Inc (Jane Doe, CEO, jane@acme.com) and Globex LLC, Delaware law, courts in Wilmington". All of them are filled in.
- [ ] Party 1 values appear only in the PARTY 1 column, and Party 2 only in the PARTY 2 column.
- [ ] "Until terminated" for the MNDA term and "forever" for confidentiality move the ☒ to those options. "2 years" reads "2 years", and 1 reads "1 year".
- [ ] **Dates:** "starting next Monday" or "from 1 March" sets the right date. Asking for an impossible term (e.g. 500 years) leaves the previous value.
- [ ] The assistant doesn't invent details you haven't given, such as the second party's signer.
- [ ] Changing your mind ("actually, make it California law") updates the preview.
- [ ] Off-topic or legal-advice questions are politely redirected. Asking for another document type says only the Mutual NDA is available.
- [ ] When everything is filled in, the assistant suggests reviewing the preview and downloading the PDF.
- [ ] Enter sends, Shift+Enter adds a new line, and you can't send while the assistant is typing. Long conversations scroll inside the chat panel.

### 3. PDF download

- [ ] With the NDA filled in, **Download PDF** briefly shows "Preparing PDF…" and then saves a file.
- [ ] The filename is `Mutual-NDA-<Company1>-<Company2>.pdf`, for example `Mutual-NDA-Acme-Inc-Globex-LLC.pdf`. With no companies it is `Mutual-NDA.pdf`. Accented names are transliterated, e.g. "Müller" becomes "Muller".
- [ ] Open the PDF in at least two viewers (the browser's built-in viewer plus Acrobat, Preview or similar). Check that:
  - [ ] Page 1 is the whole cover page, including the full signature table.
  - [ ] Every value shown in the preview appears, and only the selected options have an X.
  - [ ] The Signature row is tall enough to sign by hand, and the Signature and Date cells are blank.
  - [ ] Standard Terms start on a new page, all 11 sections are present, and term references such as **Purpose** and **Effective Date** are highlighted.
  - [ ] No words are hyphenated across lines.
  - [ ] The links (commonpaper.com and CC BY 4.0) are clickable.
  - [ ] Both CC BY 4.0 attribution lines are present.
  - [ ] Text is selectable and searchable, not an image.
  - [ ] It prints cleanly on US Letter paper.
- [ ] A very long Purpose (several paragraphs) flows onto extra pages and none of it is cut off.
- [ ] Downloading twice in a row works and produces two files.
- [ ] **Known limitation:** names in Chinese, Japanese, Cyrillic or Greek show correctly in the preview but not in the PDF. Confirm it is still the case and don't report it as a new bug.

### 4. Accessibility

- [ ] **Keyboard only:** you can chat and download the PDF without a mouse. Tab reaches the message box, Send, Retry (after an error) and the download button. Enter or Space on the button downloads the PDF. Every focused element has a clearly visible focus ring.
- [ ] **Screen reader** (NVDA, VoiceOver or Narrator):
  - [ ] The message box announces "Message the assistant".
  - [ ] New messages are announced, prefixed "You:" or "Assistant:".
  - [ ] Chat errors, "Preparing PDF…" and PDF errors are announced.
- [ ] Zooming to 200% keeps everything readable with no overlapping content.

### 5. Responsive layout

- [ ] At phone width (about 390 px) the chat sits above the preview, the page has no horizontal scrolling, and the Download PDF button stays visible in the toolbar.
- [ ] At tablet width (about 768 px) the layout is usable.
- [ ] On desktop the chat stays in view and scrolls independently of the preview, with the message box always visible.

### 6. Error handling

- [ ] Stop the app, remove `OPENROUTER_API_KEY` from `.env` and start it again. The chat shows "The AI assistant isn't configured." with a Retry button. Restore the key afterwards.
- [ ] Simulate a chat failure: in DevTools, block `/api/chat` (or go offline) and send a message. Your message stays, a red error appears with **Retry**, and Retry sends it again once unblocked.
- [ ] Simulate a PDF failure: in DevTools, block the request for the PDF chunk, then click Download. A red "Couldn't create the PDF. Please try again." message appears, the button is enabled again, and a retry works once the block is removed.

### 7. Template changes

After editing anything in `templates/Mutual-NDA*.md`:

- [ ] `npm test` passes. If the structure changed in a way the parser doesn't support, the build fails with a `TemplateParseError` naming the file and the problem. It never drops text silently.
- [ ] Re-run section 3 (PDF download) to confirm the new wording appears.
