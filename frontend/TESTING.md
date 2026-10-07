# Testing the Prelegal frontend

## Automated tests

Run from `frontend/`:

| Command | What it runs | Time |
| --- | --- | --- |
| `npm test` | Unit and component tests (Vitest + Testing Library, jsdom). | ~5 s |
| `npm run test:watch` | The same, in watch mode. | |
| `npm run test:e2e` | End-to-end tests in Chromium (Playwright) against what users get: the static build served by the real FastAPI backend (`npm run build`, then `uv run prelegal-backend` on port 3100). Needs [uv](https://docs.astral.sh/uv/) on the PATH, and `npx playwright install chromium` once beforehand. | ~1 min |
| `npm run lint` / `npx tsc --noEmit` | Static checks. Test files are included. | |
| `uv run pytest` (in `backend/`) | Backend tests: database reset, health check, API 404s, static file serving. | ~1 s |

### Coverage

| File | Covers |
| --- | --- |
| `tests/unit/nda.test.ts` | Model helpers: defaults, date formatting (including years 0–99), years parsing (1–99, whole numbers only), placeholders, cover page sections, party rows, PDF filename sanitizing (unsafe characters, accents, non-Latin text, length cap). |
| `tests/unit/nda-template.test.ts` | Template parser. Checks the real repo templates word-for-word against the source markdown, including term references, bold and links. Checks the CC BY attributions, CRLF line endings, and rejection of malformed templates (missing attribution, missing intro, wrapped lines, no sections). Also checks loading and JSON serializability. |
| `tests/unit/NdaForm.test.tsx` | Accessible labels, editing every field, party isolation, radio groups, the years input (clear and retype, max, decimals, restore on blur), no form submission, keyboard order. |
| `tests/unit/NdaPreview.test.tsx` | Heading structure, all 11 standard terms, links (https, new tab), filled values, checkbox markers, party table, signature row height, placeholders, user input rendered as text and never as HTML. |
| `tests/unit/NdaCreator.test.tsx` | Live preview, the effective date default and editing (no snap-back), the PDF download flow (data passed, filename, object URL lifecycle), the progress and busy state, error reporting and retry, and the status region. |
| `tests/unit/NdaPdfDocument.test.tsx` | Renders the **real PDF** and extracts its text. Checks metadata, the cover page fitting on page 1, every value, option marks, the standard terms word-for-word, attributions, no hyphenation, placeholders, special characters, long text flowing to new pages (never clipped), and the signature table never splitting. |
| `tests/unit/session.test.ts` | Fake session: signed out by default, sign in (email trimmed), sign out, subscribers updated, blocked storage doesn't break sign-in. |
| `tests/unit/catalog.test.ts` | Catalog loader: the NDA's Cover Page and Standard Terms merge into one document, only the NDA links to a creator, and a missing NDA entry fails the build. Checks the real `catalog.json`. |
| `tests/unit/LoginForm.test.tsx` | Labelled fields, any credentials sign in and go to `/app/`, Enter submits, both fields required. |
| `tests/unit/AppHeader.test.tsx` | Banner with brand link to the dashboard, the signed-in email, and Sign out returning to `/`. |
| `tests/unit/DocumentList.test.tsx` | Document cards, the Create link for available documents, and "Coming soon" without links for the rest. |
| `tests/unit/fix-export-segments.test.ts` | The postbuild fix flattens nested segment folders (Windows) and leaves a correct export (Linux/macOS) untouched. |
| `tests/e2e/platform.spec.ts` | Real browser against FastAPI. Health check (database reachable), JSON 404s for unknown API paths, the 404 page, sign-in (title, required fields, no console errors, axe scan), dashboard (11 documents, only the NDA creatable, axe scan), navigating to the NDA and back, sign out, trailing-slash redirects, and phone layouts with a long email. |
| `tests/e2e/nda-creator.spec.ts` | Real browser, production build, at `/app/nda/`. Checks: no console errors or hydration warnings; the date defaults to today in the browser's time zone; an axe-core WCAG 2.1 AA scan; the full form-to-preview flow; date clearing; years validation; links opening in a new tab; **actual PDF downloads**, which are parsed and checked; keyboard-only download; the PDF library loading only on demand; and the phone layout. |

Known gap: non-Latin scripts in the PDF are a `todo` test. They need an embedded Unicode font.

## Manual test plan

Run this before a release, or after changing the layout, the PDF, or the templates. Use the Docker start script for your platform (see the root README) and open http://localhost:8000, or `npm run dev`. Tick each item in at least **Chrome, Firefox and Safari**. Automated tests cover only Chromium.

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

- [ ] The NDA creator (`/app/nda/`) loads with the form on the left and the NDA preview on the right (stacked on narrow screens).
- [ ] Effective date shows **today's date**, and the preview shows it as e.g. "October 5, 2026".
- [ ] The defaults show: the Purpose text, 1-year MNDA term, and 1-year confidentiality.
- [ ] Blank fields show bracketed placeholders in the preview, e.g. "Governing Law: [Governing Law]".
- [ ] The browser console has no errors.

### 2. Form and live preview

- [ ] Typing in each field updates the preview immediately. Check Purpose, Governing law, Jurisdiction, Modifications, and every Party 1 and Party 2 field.
- [ ] Party 1 values appear only in the PARTY 1 column, and Party 2 only in the PARTY 2 column.
- [ ] Switching MNDA term to "Until terminated" moves the ☒ to that option, and the "Expires…" line turns grey.
- [ ] Switching confidentiality to "In perpetuity" works the same way.
- [ ] Clicking into a years box selects its "fixed" radio.
- [ ] **Years box:** clear it and type `5`. It shows 5, not 15. Typing `500` shows a red error and the preview keeps the last valid value. Clicking away restores the last valid value. `0` and `2.5` are rejected.
- [ ] 1 year reads "1 year", and 2 or more read "N years".
- [ ] **Date:** pick a different date and the preview updates. Clear the date fully and it stays blank, with the preview showing "[Effective Date]". Editing other fields does not bring today's date back.
- [ ] Line breaks in Purpose or Modifications are kept in the preview.
- [ ] Pressing Enter in a text field does not reload the page or clear the form.

### 3. PDF download

- [ ] With the form filled in, **Download PDF** briefly shows "Preparing PDF…" and then saves a file.
- [ ] The filename is `Mutual-NDA-<Company1>-<Company2>.pdf`, for example `Mutual-NDA-Acme-Inc-Globex-LLC.pdf`. With no companies it is `Mutual-NDA.pdf`. Accented names are transliterated, e.g. "Müller" becomes "Muller".
- [ ] Open the PDF in at least two viewers (the browser's built-in viewer plus Acrobat, Preview or similar). Check that:
  - [ ] Page 1 is the whole cover page, including the full signature table.
  - [ ] Every value typed into the form appears, and only the selected options have an X.
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

- [ ] **Keyboard only:** Tab reaches every field in order (agreement terms, then Party 1, then Party 2) and the download button. Arrow keys switch radios. Enter or Space on the button downloads the PDF. Every focused element has a clearly visible focus ring.
- [ ] **Screen reader** (NVDA, VoiceOver or Narrator):
  - [ ] Each field announces its label and hint.
  - [ ] The radio groups announce "MNDA term" and "Term of confidentiality".
  - [ ] The years inputs announce "MNDA term in years" and "Term of confidentiality in years", and "invalid" when out of range.
  - [ ] "Preparing PDF…" and any error message are announced.
- [ ] Zooming to 200% keeps everything readable with no overlapping content.

### 5. Responsive layout

- [ ] At phone width (about 390 px) the form sits above the preview, the page has no horizontal scrolling, and the Download PDF button stays visible in the toolbar.
- [ ] At tablet width (about 768 px) the layout is usable.
- [ ] On desktop the form scrolls independently of the preview.

### 6. Error handling

- [ ] Simulate a PDF failure: in DevTools, block the request for the PDF chunk, then click Download. A red "Couldn't create the PDF. Please try again." message appears, the button is enabled again, and a retry works once the block is removed.

### 7. Template changes

After editing anything in `templates/Mutual-NDA*.md`:

- [ ] `npm test` passes. If the structure changed in a way the parser doesn't support, the build fails with a `TemplateParseError` naming the file and the problem. It never drops text silently.
- [ ] Re-run section 3 (PDF download) to confirm the new wording appears.
