"use client";

import { useState, useSyncExternalStore } from "react";
import NdaForm from "@/components/NdaForm";
import NdaPreview from "@/components/NdaPreview";
import { defaultNdaData, pdfFileName, todayIso, type NdaData } from "@/lib/nda";
import type { NdaTemplate } from "@/lib/nda-template";

const subscribeNever = () => () => {};

async function downloadPdf(data: NdaData, template: NdaTemplate) {
  // Loaded on demand: the PDF renderer is large and only needed on download.
  const [{ pdf }, { NdaPdfDocument }] = await Promise.all([
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
  const [formData, setData] = useState<NdaData>(defaultNdaData);
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");

  // The Effective Date defaults to "today" in the user's time zone. It is read
  // on the client only (empty on the server) since the page is prerendered.
  const today = useSyncExternalStore(subscribeNever, todayIso, () => "");
  const data = formData.effectiveDate
    ? formData
    : { ...formData, effectiveDate: today };

  const handleDownload = async () => {
    setStatus("generating");
    try {
      await downloadPdf(data, template);
      setStatus("idle");
    } catch (error) {
      console.error("Failed to generate NDA PDF", error);
      setStatus("error");
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
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
            {status === "error" && (
              <p role="alert" className="text-sm text-red-600">
                Couldn&apos;t create the PDF. Please try again.
              </p>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={status === "generating"}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-70"
            >
              {status === "generating" ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2">
          <p className="mb-6 text-sm text-slate-600">
            Fill in the key terms and the preview updates as you type. Download
            the completed agreement as a PDF when you&apos;re done.
          </p>
          <NdaForm data={data} onChange={setData} />
        </aside>
        <section aria-label="NDA preview" className="min-w-0">
          <NdaPreview data={data} template={template} />
        </section>
      </main>
    </div>
  );
}
