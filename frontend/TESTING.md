# Testing the Mutual NDA Creator

## Automated tests

Run from `frontend/`:

| Command | What it runs | Time |
| --- | --- | --- |
| `npm test` | Unit and component tests (Vitest + Testing Library, jsdom). | ~5 s |
| `npm run test:watch` | The same, in watch mode. | |
| `npm run test:e2e` | End-to-end tests in Chromium (Playwright) against a production build (`next build && next start` on port 3100). Run `npx playwright install chromium` once beforehand. | ~1 min |
| `npm run lint` / `npx tsc --noEmit` | Static checks. Test files are included. | |

**Network:** `NdaPdfDocument.test.tsx` and the e2e PDF tests download the real Noto font pieces from jsDelivr, just as the app does, so they need internet access.

### Coverage

| File | Covers |
| --- | --- |
| `tests/unit/nda.test.ts` | Model helpers: defaults, date formatting (including years 0–99), years parsing (1–99, whole numbers only), placeholders, cover page sections, party rows, PDF filename sanitizing (unsafe characters, accents, non-Latin text, length cap). |
| `tests/unit/nda-template.test.ts` | Template parser. Checks the real repo templates word-for-word against the source markdown, including term references, bold and links. Checks the CC BY attributions, CRLF line endings, and rejection of malformed templates (missing attribution, missing intro, wrapped lines, no sections). Also checks loading and JSON serializability. |
| `tests/unit/NdaForm.test.tsx` | Accessible labels, editing every field, party isolation, radio groups, the years input (clear and retype, max, decimals, restore on blur), no form submission, keyboard order. |
| `tests/unit/NdaPreview.test.tsx` | Heading structure, all 11 standard terms, links (https, new tab), filled values, checkbox markers, party table, signature row height, placeholders, user input rendered as text and never as HTML. |
| `tests/unit/NdaCreator.test.tsx` | Live preview, the effective date default and editing (no snap-back), the PDF download flow (data passed, filename, object URL lifecycle), the progress and busy state, error reporting and retry, and the status region. Also: the fonts chosen from typed text, prefetching before registering, the font download error message, and the unsupported-characters warning (listing, summarizing, clearing, not blocking download). |
| `tests/unit/pdf-fonts.test.ts` | Font planning and loading. Checks the manifest and coverage table: pinned version, an SRI hash for every file, sorted and merged ranges, coverage exactly equal to the union of all pieces, and CJK pieces never covering other scripts. Checks the CJK language preference; the Noto Serif piece chosen for each script (Polish, Czech, Turkish, Russian, Greek, Vietnamese, math); CJK fallback across languages; stable font order; Arabic, Hebrew, Thai, Devanagari and emoji reported as unsupported and never partly drawn; jsDelivr URLs; and the CJK italic alias. Also checks tab clean-up (`toPdfText`) and the loader: one verified fetch per file, no cookies or referrer, registration as a data URL, per-session caching, `FontLoadError`, and retry after a failure. |
| `tests/unit/NdaPdfDocument.test.tsx` | Renders the **real PDF** with the real fonts and extracts its text. Checks metadata, the cover page fitting on page 1, every value, option marks, the standard terms word-for-word, attributions, no hyphenation, placeholders, special characters, long text flowing to new pages (never clipped), and the signature table never splitting. **Fonts:** Latin-only text embeds only Noto Serif regular, bold and italic; there are **no ligatures** (checked in the PDF's ToUnicode maps); and Cyrillic, Greek, Vietnamese, Central European, Japanese, Korean and Chinese text all appear in the PDF, using only the CJK pieces needed. |
| `tests/e2e/nda-creator.spec.ts` | Real browser, production build. Checks: no console errors or hydration warnings; the date defaults to today in the browser's time zone; an axe-core WCAG 2.1 AA scan; the full form-to-preview flow; date clearing; years validation; links opening in a new tab; **actual PDF downloads**, which are parsed and checked; keyboard-only download; the PDF library loading only on demand; and the phone layout. |
| `tests/e2e/pdf-fonts.spec.ts` | Real browser. Checks: a multilingual PDF download, with each script verified in the file and the CDN font requests checked; a Latin-only NDA requesting exactly the three Noto Serif latin files once each (none before download, none again on a second download); font requests carrying no Referer and no cookies; a **tampered font file rejected** by the integrity check; the CDN being blocked (clear error, then recovery); the unsupported-characters warning (announced, and not covering the panels); and the coverage table loading only for non-Latin text. |

## Manual test plan

Run this before a release, or after changing the layout, the PDF, or the templates. Use `npm run build && npm start`, or `npm run dev`. Tick each item in at least **Chrome, Firefox and Safari**. Automated tests cover only Chromium.

### 1. First load

- [ ] The page loads with the form on the left and the NDA preview on the right (stacked on narrow screens).
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
  - [ ] **Search and copy:** searching for "Confidential", "Effective" and "conflict" finds them, and copying a paragraph pastes the exact text with no missing letters. This depends on ligatures being off.
  - [ ] All text is in Noto Serif, including bold headings and italic captions.
  - [ ] It prints cleanly on US Letter paper.
- [ ] A very long Purpose (several paragraphs) flows onto extra pages and none of it is cut off.
- [ ] Downloading twice in a row works and produces two files.

### 3a. International text in the PDF

Paste each sample into a different field, download, and open the PDF in two viewers:

| Script | Sample |
| --- | --- |
| Central European | `Zażółć gęślą jaźń; Dvořák; Ağaoğlu; Őrség` |
| Cyrillic | `Сотрудничество в области исследований` |
| Greek | `Έρευνα και ανάπτυξη` |
| Vietnamese | `Thành phố Hồ Chí Minh` |
| Japanese | `株式会社さくら 山田 太郎` |
| Korean | `김민준 대표이사` |
| Chinese | `李明 有限公司` |

- [ ] Every sample appears in the PDF exactly as typed, with no boxes (☐), question marks or blanks, and with accents and diacritics in the right place.
- [ ] The Japanese, Korean and Chinese text looks natural for each language. Japanese and Chinese use different shapes for some shared characters.
- [ ] Each sample can be copied out of the PDF and pasted back exactly.
- [ ] The cover page still fits on page 1.
- [ ] **Unsupported scripts:** type `مرحبا` (Arabic) or `שלום` (Hebrew). An amber notice under the header lists those characters, and a screen reader announces it. The form and preview stay fully visible below it. The PDF still downloads, and the characters are missing from it. Removing them hides the notice.
- [ ] **Tabs:** paste text containing a tab, e.g. from a spreadsheet, into Purpose. In the PDF the words on either side are separated by a space, not run together.
- [ ] **Offline:** in DevTools, set the network to Offline (after the page has loaded) and click Download. The page shows "Couldn't download the PDF fonts. Check your connection and try again." Going back online and retrying works.
- [ ] **Network panel:**
  - A Latin-only NDA requests just three `noto-serif-latin-*.woff` files from `cdn.jsdelivr.net`, once each and only when you click Download.
  - A second download makes no new font requests.
  - The font requests have no `Referer` or `Cookie` header.

### 4. Accessibility

- [ ] **Keyboard only:** Tab reaches every field in order (agreement terms, then Party 1, then Party 2) and the download button. Arrow keys switch radios. Enter or Space on the button downloads the PDF. Every focused element has a clearly visible focus ring.
- [ ] **Screen reader** (NVDA, VoiceOver or Narrator):
  - [ ] Each field announces its label and hint.
  - [ ] The radio groups announce "MNDA term" and "Term of confidentiality".
  - [ ] The years inputs announce "MNDA term in years" and "Term of confidentiality in years", and "invalid" when out of range.
  - [ ] "Preparing PDF…" and any error message are announced.
- [ ] Zooming to 200% keeps everything readable with no overlapping content.

### 5. Responsive layout

- [ ] At phone width (about 390 px) the form sits above the preview, the page has no horizontal scrolling, and the Download PDF button stays visible in the header.
- [ ] At tablet width (about 768 px) the layout is usable.
- [ ] On desktop the page itself doesn't scroll. The header stays in place, and the form and the preview each scroll in their own panel.

### 6. Error handling

- [ ] Simulate a PDF failure: in DevTools, block the request for the PDF chunk, then click Download. A red "Couldn't create the PDF. Please try again." message appears, the button is enabled again, and a retry works once the block is removed.

### 7. Template changes

After editing anything in `templates/Mutual-NDA*.md`:

- [ ] `npm test` passes. If the structure changed in a way the parser doesn't support, the build fails with a `TemplateParseError` naming the file and the problem. It never drops text silently.
- [ ] Re-run section 3 (PDF download) to confirm the new wording appears.
