# Prelegal frontend

Next.js app for drafting legal agreements. It currently ships the **Mutual NDA Creator** (PL-3): fill in the key terms in a form, see the Common Paper Mutual NDA update live, and download the completed agreement as a PDF.

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build`, `npm start`, `npm run lint`.

> Run commands from the `frontend/` directory. The NDA text is read at build time from the repo's `../templates/` folder (resolved relative to the working directory).

## How it works

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Server Component; loads the NDA template and renders the creator. |
| `lib/nda-template.ts` | Reads `templates/Mutual-NDA-coverpage.md` and `templates/Mutual-NDA.md` and parses them into structured, serializable content (server-only). |
| `lib/nda.ts` | `NdaData` model, defaults, and derived cover-page content shared by the preview and the PDF. |
| `components/NdaCreator.tsx` | Client container: form state, layout, PDF download. |
| `components/NdaForm.tsx` | Form inputs for agreement terms and both parties. |
| `components/NdaPreview.tsx` | HTML rendering of the completed NDA. |
| `components/NdaPdfDocument.tsx` | `@react-pdf/renderer` version of the NDA, lazy-loaded on download. |

Signature and date rows are intentionally left blank for the parties to sign.

The Mutual NDA text is © Common Paper, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
