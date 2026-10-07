"use client";

import { useState, useSyncExternalStore } from "react";
import NdaForm from "@/components/NdaForm";
import NdaPreview from "@/components/NdaPreview";
import { defaultNdaData, pdfFileName, todayIso, type NdaData } from "@/lib/nda";
import type { NdaTemplate } from "@/lib/nda-template";
import { primaryButtonClass } from "@/lib/styles";

const subscribeNever = () => () => {};

const STATUS_MESSAGES = {
  idle: "",
  generating: "Preparing PDF…",
  error: "Couldn't create the PDF. Please try again.",
} as const;

async function downloadPdf(data: NdaData, template: NdaTemplate) {
  // Loaded on demand: the PDF renderer is large and only needed on download.
  const [{ pdf }, { default: NdaPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/NdaPdfDocument"),
  ]);
  const blob = await pdf(<NdaPdfDocument data={data} template={template} />).toBlob();
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
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");

  // Until the user edits it, the Effective Date is "today" in their time zone.
  // It's read on the client only (empty on the server) as the page is
  // prerendered. Once edited, the user's value is kept, even if blank.
  const today = useSyncExternalStore(subscribeNever, todayIso, () => "");
  const ndaData = dateEdited ? formData : { ...formData, effectiveDate: today };

  const handleChange = (next: NdaData) => {
    if (next.effectiveDate !== ndaData.effectiveDate) setDateEdited(true);
    setFormData(next);
  };

  const handleDownload = async () => {
    setStatus("generating");
    try {
      await downloadPdf(ndaData, template);
      setStatus("idle");
    } catch (error) {
      console.error("Failed to generate NDA PDF", error);
      setStatus("error");
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Toolbar under the app header, so the download button stays in reach. */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold text-heading">Mutual NDA Creator</h1>
          <div className="flex items-center gap-3">
            {/* Always mounted so screen readers reliably announce changes. */}
            <p
              role="status"
              className={`text-sm ${status === "error" ? "text-red-700" : "sr-only"}`}
            >
              {STATUS_MESSAGES[status]}
            </p>
            <button
              type="button"
              onClick={handleDownload}
              disabled={status === "generating"}
              aria-busy={status === "generating"}
              className={`${primaryButtonClass} disabled:cursor-wait disabled:opacity-70`}
            >
              {status === "generating" ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2">
          <p className="mb-6 text-sm text-slate-600">
            Fill in the key terms and the preview updates as you type. Download
            the completed agreement as a PDF when you&apos;re done.
          </p>
          <NdaForm data={ndaData} onChange={handleChange} />
        </aside>
        <section aria-label="NDA preview" className="min-w-0">
          <NdaPreview data={ndaData} template={template} />
        </section>
      </main>
    </div>
  );
}
