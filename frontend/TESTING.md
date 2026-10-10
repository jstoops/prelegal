# Testing the Prelegal frontend

## Automated tests

Run from `frontend/`:

| Command | What it runs | Time |
| --- | --- | --- |
| `npm test` | Unit and component tests (Vitest + Testing Library, jsdom). | ~5 s |
| `npm run test:watch` | The same, in watch mode. | |
| `npm run test:e2e` | End-to-end tests in Chromium (Playwright) against what users get: the static build served by the real FastAPI backend (`npm run build`, then `uv run prelegal-backend` on port 3100). Needs [uv](https://docs.astral.sh/uv/) on the PATH, and `npx playwright install chromium` once beforehand. | ~1 min |
| `npm run lint` / `npx tsc --noEmit` | Static checks. Test files are included. | |
| `uv run pytest` (in `backend/`) | Backend tests: database reset and schema, health check, API 404s, static file serving, settings, `documents.json` (covers `catalog.json`, valid definitions, a strict-mode-friendly schema per document), and the AI chat with a fake LLM. The chat tests cover choosing and switching documents (asking again with the new prompt, carrying values over), prompt contents (catalog, pre-filled terms to confirm, missing fields by party role), merging updates, ignoring invalid values, errors and request validation, and long conversations (only the latest messages sent to the LLM, a clear message past the limit). **Accounts** (`test_auth.py`, `test_security.py`): sign up (cookie flags, email normalizing, duplicates, validation), sign in (wrong password and unknown email look the same), sign out, expired and unknown sessions, only hashes stored, every protected endpoint refusing signed-out requests, and a restart forgetting everyone. **Saved documents** (`test_drafts.py`): saving through the chat (not on the greeting or before a document is chosen, created once then updated, the stored conversation, switching documents, titles, long saved conversations continuing), listing newest first, opening, deleting, another user's documents always 404 (checked before the LLM is called), and documents that no longer fit `documents.json`. | ~10 s |

### Coverage

| File | Covers |
| --- | --- |
| `tests/unit/document.test.ts` | Model helpers for every document: defaults, blank dates shown as today, date formatting (including years 0–99), Cover Page sections (grouped sections, choice options with embedded years, placeholders and "None." for optional fields), party headings by role, party rows, creator links, PDF filename sanitizing (unsafe characters, accents, non-Latin text, length cap). |
| `tests/unit/template.test.ts` | Template parser. Checks the Mutual NDA and the CSA word-for-word against the source markdown, nested clause numbering (1., 1.1, (a), (i)), headings, every term-span class, bold containing terms, links and autolinks, attributions and CRLF line endings. Rejects malformed templates (unknown markup, unbalanced bold, wrapped lines, over-nesting, no clauses). Parses all 11 templates, which must be JSON-serializable. |
| `tests/unit/catalog.test.ts` | Loads the real `documents.json`, checks it covers every template in `catalog.json`, and checks each document's parsed intro, attribution and Standard Terms. |
| `tests/unit/api.test.ts` | The shared API client: JSON with the session cookie, 204s, server messages (and the backend's own validation messages), fallbacks for other errors, network failures, aborts, and a 401 signing the user out except where it's expected (a wrong password). |
| `tests/unit/auth.test.tsx` | The auth provider: loading until the session is checked, signed in or out, sign in and sign up, refused credentials, sign out (even offline), and any request finding the session ended. |
| `tests/unit/AuthGate.test.tsx` | Only a loading state until the session is known, signed-in users kept out of the sign-in pages and signed-out visitors kept out of the app. |
| `tests/unit/AuthForm.test.tsx` | Sign in and sign up: labelled fields, autocomplete hints, the 8-character minimum, errors announced and linked to the fields, retrying, the pending state preventing double submits, links between the two. |
| `tests/unit/chat.test.ts` | The `/api/chat` client: request body (history, document, local date, saved id), replies before a document is chosen, server error messages, generic messages for validation errors, non-JSON and malformed replies, network failures, aborts. |
| `tests/unit/DocumentChat.test.tsx` | Greeting on load (once, even in strict mode), sending with Enter or the Send button, Shift+Enter for new lines, blank messages ignored, no sending while waiting, the latest document sent, chatting before a document is chosen, screen-reader labels for who said what, errors with Retry (including a failed greeting). Saving: the saved id sent once a turn has saved, resuming a saved conversation without a new greeting, and saving a new copy when the saved one was deleted elsewhere. |
| `tests/unit/drafts.test.ts` | The saved-documents client (list, open, delete, ids escaped) and "Edited 5 minutes ago" formatting. |
| `tests/unit/SavedDocumentList.test.tsx` | Loading, the list with Open links, the document type when the title doesn't name it, the empty state, errors with Retry, deleting (confirm, cancel, failure, and where keyboard focus goes at each step), and the dashboard's "Recent documents" (latest three, View all, hidden while loading, when empty or on errors). |
| `tests/unit/CreatorFromUrl.test.tsx` | `?doc=` starting a new document, `?id=` continuing a saved one (no greeting), and documents that can't be opened. |
| `tests/unit/SiteFooter.test.tsx` | The draft disclaimer and the Common Paper CC BY 4.0 credit on every page. |
| `tests/unit/DocumentPreview.test.tsx` | Heading structure, all 11 NDA standard terms, links (https, new tab), filled values, checkbox markers, party table, signature row height, placeholders, user input rendered as text and never as HTML. For other documents: party roles, their own fields and defaults, nested clauses, a single attribution, and every document rendering. |
| `tests/unit/DocumentCreator.test.tsx` | The draft disclaimer banner and preview line, "Saved to My documents" once saved, continuing a saved document. Starting from a preselected document (or none, or an unknown id). The chat updating the live preview (via a fake `/api/chat`), and following the assistant when it picks or switches a document. The updated document sent with the next message, and dates (today until the assistant sets one, and today again if it's cleared). The PDF download flow (data passed, filename per document, object URL lifecycle), the progress and busy state, error reporting and retry, and the status region. |
| `tests/unit/DocumentPdf.test.tsx` | Renders the **real PDF** and extracts its text. Checks metadata, the draft disclaimer on every page, the cover page fitting on page 1, every value, option marks, the standard terms word-for-word, attributions, no hyphenation, placeholders, special characters, long text flowing to new pages (never clipped), and the signature table never splitting. Also renders all 11 documents and checks every clause is present. |
| `tests/unit/AppHeader.test.tsx` | Banner with brand link to the dashboard, navigation marking the current page, the signed-in email, and Sign out through the API. |
| `tests/unit/DocumentList.test.tsx` | Document cards, each with a Create link that preselects it in the creator. |
| `tests/unit/fix-export-segments.test.ts` | The postbuild fix flattens nested segment folders (Windows) and leaves a correct export (Linux/macOS) untouched. |
| `tests/e2e/platform.spec.ts` | Real browser against FastAPI, with real accounts (a unique email per test, as the e2e database outlives a run). Health check (database reachable), JSON 404s for unknown API paths, the API refusing signed-out requests, the 404 page. Sign in and sign up pages (titles, the footer disclaimer, no console errors, axe scans), signing up, out and back in, staying signed in across reloads and tabs, wrong passwords, taken emails, short passwords, signed-out visitors kept out of the app, and an ended session signing the user out. Dashboard (11 creatable documents, no recent documents for a new user, axe scan), opening the NDA and coming back, "Ask the assistant", the header navigation and an empty My documents (axe scan), trailing-slash redirects, and phone layouts with a long email. |
| `tests/e2e/history.spec.ts` | Saved documents in a real browser: an empty list and an unopenable document from the real backend, then (with the chat and saved-documents API mocked in the browser, as there's no LLM) saving as you chat, "Saved to My documents", the list and the dashboard's recent documents (axe scan), reopening with the conversation and preview restored and no new greeting, later turns updating the same document, deleting, and the creator's disclaimer. |
| `tests/e2e/document-creator.spec.ts` | Real browser, production build, at `/app/create/`. Checks no console errors or hydration warnings, the date defaulting to today in the browser's time zone, and axe-core WCAG 2.1 AA scans. A scripted chat (`/api/chat` mocked in the browser) fills every NDA field. Also covers: choosing a document in the chat (after an unsupported request), switching documents, every document's preview from its dashboard link, the request contents, errors and Retry, and the real backend's "not configured" error (the e2e server runs with an empty `OPENROUTER_API_KEY`, so tests never call the real LLM). Then links opening in a new tab, **actual PDF downloads** (NDA and CSA), which are parsed and checked, keyboard-only download, the PDF library loading only on demand, and the phone layout. |

Known gaps: non-Latin scripts in the PDF are a `todo` test. They need an embedded Unicode font. The real LLM is never called by automated tests, so check the chat's behaviour with the manual test plan (section 2). For the same reason, saving through the real chat is covered by the backend tests, not end to end: check it with section 0b.

## Manual test plan

Run this before a release, or after changing the layout, the PDF, or the templates. Use the Docker start script for your platform (see the root README), with `OPENROUTER_API_KEY` in the repo's `.env`, and open http://localhost:8000. Tick each item in at least **Chrome, Firefox and Safari**. Automated tests cover only Chromium.

### 0. Accounts and dashboard

- [ ] `/` shows the Sign in screen, with a product panel on wide screens. Submitting with an empty field shows the browser's "required" message.
- [ ] **Create an account** opens `/signup/`. A password under 8 characters is refused. Signing up opens the dashboard at `/app/`, with your email in the header.
- [ ] Signing up again with the same email (in any letter case) says the account already exists.
- [ ] Sign out, then sign in with the wrong password: "Incorrect email or password." Signing in with the right one works.
- [ ] Signed out, `/app/`, `/app/documents/` and `/app/create/` all go back to the sign-in page. Signed in, `/` and `/signup/` go to the dashboard. Reloading keeps you signed in.
- [ ] Every page has a footer saying documents are drafts subject to legal review.
- [ ] The dashboard lists 11 documents, each with a **Create** button, plus **Ask the assistant**. The header has **New document** and **My documents**, with the current page highlighted.
- [ ] **Create** on the Mutual NDA opens the creator at `/app/create/?doc=mutual-nda`, titled "Mutual Non-Disclosure Agreement". **← All documents** next to the title (just the arrow on phones) returns to the dashboard, and so does **Prelegal** in the header.
- [ ] **Ask the assistant** opens `/app/create/`, titled "New Document", with "No document chosen yet" in place of the preview.
- [ ] **Sign out** returns to `/`.
- [ ] An unknown URL (e.g. `/nope/`) shows "Page not found" with a link back to the documents.
- [ ] http://localhost:8000/api/health returns `{"status":"ok","database":"ok"}`.
- [ ] Stopping and starting the app again with the scripts works, and the start script reports it is running. The database starts afresh, so your account and documents are gone and you're signed out.

### 0b. Saved documents

- [ ] A new account's **My documents** says "No documents yet", and the dashboard has no "Recent documents".
- [ ] Open a document and just read the greeting: nothing is saved. Send one message: "Saved to My documents" appears in the creator's toolbar.
- [ ] **My documents** lists it, titled with the document's name (and the companies once given), "Edited just now". The dashboard shows it under "Recent documents".
- [ ] **Open** it: the conversation and the preview are as you left them, with no new greeting. Carry on chatting; it stays one document and moves to the top of the list.
- [ ] Start a few more; the dashboard shows the latest three with **View all**.
- [ ] **Delete** asks for confirmation, then removes it. **Cancel** keeps it. With the keyboard, focus moves to Cancel, back to Delete on cancel, and to the list after deleting.
- [ ] Delete a document in one tab while it's open in another, then send a message there: it says the document was deleted, and Retry saves it as a new one.
- [ ] Sign up as a second user in another browser: they see none of the first user's documents, and opening one of its `/app/create/?id=...` links says "We couldn't open this document".

### 1. First load

- [ ] The creator shows an amber "Draft only" notice above the chat and preview, and the preview starts with the same disclaimer.
- [ ] The NDA creator (`/app/create/?doc=mutual-nda`) loads with the chat on the left and the NDA preview on the right (stacked on narrow screens).
- [ ] "Assistant is typing…" shows briefly. Then the assistant greets you, lists the pre-filled terms (Purpose, Effective Date today, 1-year terms, no modifications) and asks whether they're correct.
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
- [ ] Off-topic or legal-advice questions are politely redirected.
- [ ] The assistant doesn't move on from the pre-filled terms until you confirm or change them, and doesn't ask about them again once confirmed.
- [ ] When everything is filled in, the assistant suggests reviewing the preview and downloading the PDF.
- [ ] Enter sends, Shift+Enter adds a new line, and you can't send while the assistant is typing. Long conversations scroll inside the chat panel.

### 2b. Choosing a document

- [ ] From **Ask the assistant**, describe a need, e.g. "We sell SaaS to businesses". The assistant suggests the Cloud Service Agreement and explains why. The preview appears only once you agree, titled "Cloud Service Agreement", with PROVIDER and CUSTOMER columns.
- [ ] Ask for something unsupported, e.g. "an employment contract" or "a residential lease". The assistant says it can't draft that, suggests the closest document (e.g. the Professional Services Agreement) and asks whether you want it.
- [ ] Right after a document is chosen, the assistant lists its pre-filled terms (e.g. Subscription Period: 1 year, General Cap Amount) and asks whether they're correct.
- [ ] Mid-conversation, ask to switch ("actually, make it a pilot agreement"). The preview switches, and company names and values you gave (e.g. governing law) carry over.
- [ ] Open each of the 11 documents from the dashboard. Each greets you, names the document, and its preview shows the right parties and Standard Terms (numbered 1., 1.1, (a)).
- [ ] Fill in and download at least the CSA, the DPA and the Partnership Agreement. Each PDF is named after the document (e.g. `Cloud-Service-Agreement-Acme-Globex.pdf`) and ends its cover page with a CC BY 4.0 attribution.

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
  - [ ] Every page ends with the small grey draft disclaimer, clear of the text.
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

After editing anything in `templates/` or `documents.json`:

- [ ] `npm test` passes. If the structure changed in a way the parser doesn't support, the build fails with a `TemplateParseError` naming the file and the problem. It never drops text silently.
- [ ] `uv run pytest` passes (in `backend/`). It checks `documents.json` against `catalog.json` and validates every definition.
- [ ] Re-run section 3 (PDF download) to confirm the new wording appears.
