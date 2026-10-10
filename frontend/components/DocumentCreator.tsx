"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import DocumentChat from "@/components/DocumentChat";
import DocumentPreview from "@/components/DocumentPreview";
import type { CreatorDocument } from "@/lib/catalog";
import type { ChatMessage } from "@/lib/chat";
import {
  defaultDocumentData,
  DRAFT_DISCLAIMER,
  emptyDocumentData,
  pdfFileName,
  todayIso,
  withDefaultDates,
  type DocumentData,
} from "@/lib/document";
import { primaryButtonClass } from "@/lib/styles";

const subscribeNever = () => () => {};

const STATUS_MESSAGES = {
  idle: "",
  generating: "Preparing PDF…",
  error: "Couldn't create the PDF. Please try again.",
} as const;

async function downloadPdf(document: CreatorDocument, data: DocumentData) {
  // Loaded on demand: the PDF renderer is large and only needed on download.
  const [{ pdf }, { default: DocumentPdf }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/DocumentPdf"),
  ]);
  const blob = await pdf(<DocumentPdf document={document} data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = pdfFileName(document.definition, data);
  link.click();
  // Defer revoking so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A document from the user's saved documents, to continue working on. */
export interface SavedDocument {
  id: string;
  data: DocumentData;
  messages: ChatMessage[];
}

interface DocumentCreatorProps {
  documents: CreatorDocument[];
  /** The document picked on the dashboard; without one, the chat works it out. */
  initialDocumentId?: string | null;
  saved?: SavedDocument;
}

export default function DocumentCreator({ documents, initialDocumentId, saved }: DocumentCreatorProps) {
  const [data, setData] = useState<DocumentData>(() => {
    if (saved) return saved.data;
    const initial = documents.find((d) => d.definition.id === initialDocumentId);
    return initial ? defaultDocumentData(initial.definition) : emptyDocumentData();
  });
  const [status, setStatus] = useState<keyof typeof STATUS_MESSAGES>("idle");
  // Set once the chat has saved the document to the user's documents.
  const [savedId, setSavedId] = useState(saved?.id ?? null);
  const document = documents.find((d) => d.definition.id === data.documentId);

  // Until the assistant sets them, dates are "today" in the user's time zone.
  // It's read on the client only (empty on the server) as the page is
  // prerendered.
  const today = useSyncExternalStore(subscribeNever, todayIso, () => "");
  const displayData = document ? withDefaultDates(document.definition, data, today) : data;

  const handleDownload = async () => {
    if (!document) return;
    setStatus("generating");
    try {
      await downloadPdf(document, displayData);
      setStatus("idle");
    } catch (error) {
      console.error("Failed to generate PDF", error);
      setStatus("error");
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Toolbar under the app header, so the download button stays in reach. */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* The label includes the visible text, which phones hide to save room. */}
            <Link
              href="/app/"
              aria-label="Back to all documents"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-raven shadow-sm hover:border-brand hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden>←</span>
              <span className="hidden sm:inline">All documents</span>
            </Link>
            <h1 className="truncate text-lg font-semibold text-heading">
              {document ? document.definition.name : "New Document"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {savedId && (
              <Link
                href="/app/documents/"
                className="hidden items-center gap-1.5 text-sm text-raven hover:text-heading sm:inline-flex"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-600" />
                Saved to My documents
              </Link>
            )}
            {/* Always mounted so screen readers reliably announce changes. */}
            <p
              role="status"
              className={`text-sm ${status === "error" ? "text-red-700" : "sr-only"}`}
            >
              {STATUS_MESSAGES[status]}
            </p>
            {document && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={status === "generating"}
                aria-busy={status === "generating"}
                className={`${primaryButtonClass} disabled:cursor-wait disabled:opacity-70`}
              >
                {status === "generating" ? STATUS_MESSAGES.generating : "Download PDF"}
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        {/* On desktop the chat fills the window below the app header, toolbar
            and padding (11rem), so the message box is always in view. */}
        <aside className="flex flex-col lg:sticky lg:top-24 lg:h-[calc(100dvh-11rem)]">
          <p className="mb-4 text-sm text-slate-600">
            {document
              ? "Chat with the assistant about your agreement and the preview fills in as you go. Download it as a PDF when you're done."
              : "Tell the assistant what you need and it will suggest the right agreement, then help you fill it in."}
          </p>
          <div className="min-h-0 flex-1">
            <DocumentChat
              data={data}
              onDataChange={setData}
              resume={saved && { savedId: saved.id, messages: saved.messages }}
              onSaved={setSavedId}
            />
          </div>
        </aside>
        <div className="min-w-0 space-y-6">
          {/* With the preview rather than above both columns, so it doesn't push the chat down. */}
          <p
            role="note"
            className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span aria-hidden className="font-bold">!</span>
            <span>
              <strong className="font-semibold">Draft only.</strong> {DRAFT_DISCLAIMER}
            </span>
          </p>
          <section aria-label="Document preview">
            {document ? (
              <DocumentPreview document={document} data={displayData} />
            ) : (
              <div className="mx-auto max-w-[8.5in] rounded-lg border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
                <h2 className="text-lg font-semibold text-heading">No document chosen yet</h2>
                <p className="mt-2 text-sm text-raven">
                  Your agreement will appear here once you and the assistant pick one. You
                  can also{" "}
                  <Link href="/app/" className="font-medium text-brand-strong underline underline-offset-2">
                    choose one from the documents list
                  </Link>
                  .
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
