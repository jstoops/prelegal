# Prelegal frontend

Next.js app for drafting legal agreements. It currently ships the **Mutual NDA Creator** (PL-3): fill in the key terms in a form, see the Common Paper Mutual NDA update live, and download the completed agreement as a PDF.

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm test` (unit and component tests) and `npm run test:e2e` (Playwright, which needs `npx playwright install chromium` once). See [TESTING.md](TESTING.md) for test coverage and the manual test plan.

> Run commands from the `frontend/` directory. The NDA text is read at build time from the repo's `../templates/` folder (resolved relative to the working directory).

## How it works

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Server Component; loads the NDA template and renders the creator. |
| `lib/nda-template.ts` | Reads `templates/Mutual-NDA-coverpage.md` and `templates/Mutual-NDA.md` and parses them into structured, serializable content (server-only). Parsing is strict: if the template structure changes unexpectedly, the build fails instead of silently dropping text. |
| `lib/nda.ts` | `NdaData` model, defaults, and derived cover-page content shared by the preview and the PDF. |
| `components/NdaCreator.tsx` | Client container: form state, layout, PDF download. |
| `components/NdaForm.tsx` | Form inputs for agreement terms and both parties. |
| `components/NdaPreview.tsx` | HTML rendering of the completed NDA. |
| `components/NdaPdfDocument.tsx` | `@react-pdf/renderer` version of the NDA, lazy-loaded on download. |
| `lib/pdf-fonts/index.ts` | `planFonts()`: chooses the font pieces the PDF needs (see below). |
| `lib/pdf-fonts/load.ts` | Downloads, verifies and registers those fonts with react-pdf. |
| `lib/pdf-fonts/coverage.ts` | `useUnsupportedChars()`: the live warning about characters the PDF can't include. |
| `lib/pdf-fonts/*.json` | Generated font manifest and coverage table. Don't edit them by hand. |
| `scripts/generate-font-manifest.mjs` | Regenerates the JSON from Fontsource (`npm run gen:fonts`). |

Signature and date rows are intentionally left blank for the parties to sign.

### PDF fonts

The PDF is set in [Noto Serif](https://fonts.google.com/noto/specimen/Noto+Serif), with Noto Sans SC, JP and KR for Chinese, Japanese and Korean ([PL-4](https://johnstoops.atlassian.net/browse/PL-4)). Supported scripts:
- Latin, including Central European and Vietnamese letters;
- Cyrillic and Greek;
- Chinese, Japanese and Korean.

How it works:
- **Pieces:** Fontsource splits each font into small pieces by character range. When you download a PDF, `planFonts()` picks only the pieces your text uses.
  - A Latin-only NDA loads three small files: regular, bold and italic.
  - A Japanese name adds a few CJK pieces.
  - The PDF embeds only the glyphs it uses.
- **Where they come from:** the font files are fetched from jsDelivr (`cdn.jsdelivr.net/npm/@fontsource/...`), pinned to the version in `manifest.json`.
  - Each file is downloaded once per session and checked against the SHA-256 recorded in the manifest (Subresource Integrity), so a modified file is rejected.
  - The checked bytes are passed to react-pdf directly, so react-pdf never contacts the CDN itself.
  - **Generating a PDF needs internet access.** If the fonts can't be downloaded or fail the check, the app says so and lets you retry.
- **CJK fonts:** for Han characters shared by all three languages, the app uses Japanese glyph shapes when the text contains kana, Korean when it contains Hangul, and Chinese otherwise.
- **Unsupported scripts:** Arabic, Hebrew, Thai, Devanagari, emoji and other scripts aren't supported. If you type them, a notice under the header lists the characters that won't appear in the PDF.
- **Ligatures are off** ("fi" is drawn as two letters) so that searching and copying the PDF work in every reader.

To change the Fontsource version or the font pieces, edit `scripts/generate-font-manifest.mjs`. Then run `npm run gen:fonts` (needs network) and commit the regenerated JSON files. They're minified, so review the script change rather than the JSON diff.

#### Privacy and third-party requests

The NDA text itself never leaves the browser. Downloading font pieces does reveal a little to jsDelivr and its network providers:
- the user's IP address and browser, as with any web request;
- which pieces were requested. Cyrillic, Greek and Vietnamese pieces reveal the script, and each CJK piece covers a few hundred characters, which hints at what was typed in names and addresses.

Requests are sent without cookies or a `Referer` header, so the page address isn't shared. A Latin-only NDA requests only the three Noto Serif latin files, which reveal nothing about its content.

If you add a Content Security Policy, allow `connect-src https://cdn.jsdelivr.net`. Fonts are fetched with `fetch`, so `font-src` doesn't apply. jsDelivr can be slow or blocked in some regions, including mainland China. To self-host instead, serve the same files and change `baseUrl` in the generator.

#### Font licenses

All fonts are under the [SIL Open Font License 1.1](https://openfontlicense.org) and served by [Fontsource](https://fontsource.org):
- Noto Serif: © The Noto Project Authors.
- Noto Sans SC, JP and KR: © Google. They are derived from Adobe's Source Han Sans (© Adobe, Reserved Font Name "Source").

The Mutual NDA text is © Common Paper, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
