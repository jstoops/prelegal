"use client";

import { useState, useSyncExternalStore } from "react";
import NdaForm from "@/components/NdaForm";
import NdaPreview from "@/components/NdaPreview";
import {
  defaultNdaData,
  documentTexts,
  mapUserTexts,
  pdfFileName,
  todayIso,
  userTexts,
  type NdaData,
} from "@/lib/nda";
import type { NdaTemplate } from "@/lib/nda-template";
import { toPdfText } from "@/lib/pdf-fonts/chars";
import { useUnsupportedChars } from "@/lib/pdf-fonts/coverage";
import { FontLoadError } from "@/lib/pdf-fonts/errors";

const subscribeNever = () => () => {};

type Status = "idle" | "generating" | "error" | "fontError";

const STATUS_MESSAGES: Record<Status, string> = {
  idle: "",
  generating: "Preparing PDF…",
  error: "Couldn't create the PDF. Please try again.",
  fontError: "Couldn't download the PDF fonts. Check your connection and try again.",
};

/** How many unsupported characters the warning lists before summarizing. */
const MAX_LISTED_CHARS = 12;

async function downloadPdf(formData: NdaData, template: NdaTemplate) {
  // Loaded on demand: the PDF renderer, document and font manifest are large
  // and only needed on download.
  const [{ pdf }, { default: NdaPdfDocument }, { planFonts }, { loadPdfFonts }] =
    await Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/NdaPdfDocument"),
      import("@/lib/pdf-fonts"),
      import("@/lib/pdf-fonts/load"),
    ]);
  const data = mapUserTexts(formData, toPdfText);
  const { fonts } = planFonts(documentTexts(data, template));
  const stack = await loadPdfFonts(fonts);
  const blob = await pdf(
    <NdaPdfDocument data={data} template={template} fonts={stack} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfFileName(data);
  link.click();
  // Defer revoking so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function NdaCreator({ template }: { template: NdaTemplate }) {
  const [formData, setFormData] = useState<NdaData>(defaultNdaData);
  const [dateEdited, setDateEdited] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  // Until the user edits it, the Effective Date is "today" in their time zone.
  // It's read on the client only (empty on the server) as the page is
  // prerendered. Once edited, the user's value is kept, even if blank.
  const today = useSyncExternalStore(subscribeNever, todayIso, () => "");
  const ndaData = dateEdited ? formData : { ...formData, effectiveDate: today };

  const handleChange = (next: NdaData) => {
    if (next.effectiveDate !== ndaData.effectiveDate) setDateEdited(true);
    setFormData(next);
  };

  // Characters the PDF fonts can't draw, shown as a warning.
  const unsupported = useUnsupportedChars(userTexts(ndaData).join("\n"));

  const handleDownload = async () => {
    setStatus("generating");
    try {
      await downloadPdf(ndaData, template);
      setStatus("idle");
    } catch (error) {
      console.error("Failed to generate NDA PDF", error);
      setStatus(error instanceof FontLoadError ? "fontError" : "error");
    }
  };

  const listed = unsupported.slice(0, MAX_LISTED_CHARS).join(" ");
  const more = unsupported.length - MAX_LISTED_CHARS;

  // On desktop the page is an app shell: the header stays put and the form and
  // preview scroll in their own panels, so the header can grow (e.g. with the
  // warning) without covering either. Phones use normal page scrolling.
  return (
    <div className="flex min-h-full flex-1 flex-col lg:h-dvh lg:min-h-0 lg:flex-none lg:overflow-hidden">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur lg:static">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Prelegal
            </p>
            <h1 className="text-lg font-semibold text-slate-900">
              Mutual NDA Creator
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Always mounted so screen readers reliably announce changes. */}
            <p
              role="status"
              className={`text-sm ${status === "error" || status === "fontError" ? "text-red-700" : "sr-only"}`}
            >
              {STATUS_MESSAGES[status]}
            </p>
            <button
              type="button"
              onClick={handleDownload}
              disabled={status === "generating"}
              aria-busy={status === "generating"}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-70"
            >
              {status === "generating" ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
        </div>
        {/* Always mounted (a live region) so the warning is announced. */}
        <div aria-live="polite">
          {unsupported.length > 0 && (
            <p className="border-t border-amber-200 bg-amber-50">
              <span className="mx-auto block max-w-7xl px-4 py-2 text-sm text-amber-900 sm:px-6">
                These characters won&apos;t appear in the PDF:{" "}
                <span className="font-medium">{listed}</span>
                {more > 0 && ` and ${more} more`}. Supported scripts are Latin,
                Cyrillic, Greek, Vietnamese, Chinese, Japanese and Korean.
              </span>
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6 lg:min-h-0 lg:grid-cols-[minmax(320px,400px)_1fr] lg:grid-rows-1 lg:py-0">
        <aside className="lg:overflow-y-auto lg:py-8 lg:pr-2">
          <p className="mb-6 text-sm text-slate-600">
            Fill in the key terms and the preview updates as you type. Download
            the completed agreement as a PDF when you&apos;re done.
          </p>
          <NdaForm data={ndaData} onChange={handleChange} />
        </aside>
        <section aria-label="NDA preview" className="min-w-0 lg:overflow-y-auto lg:py-8">
          <NdaPreview data={ndaData} template={template} />
        </section>
      </main>
    </div>
  );
}
