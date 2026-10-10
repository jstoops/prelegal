"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import DocumentCreator from "@/components/DocumentCreator";
import { ApiError, GENERIC_ERROR } from "@/lib/api";
import type { CreatorDocument } from "@/lib/catalog";
import { getDraft, type Draft } from "@/lib/drafts";
import { cardClass, primaryButtonClass } from "@/lib/styles";

/**
 * The creator for the URL: `?id=<saved id>` continues one of the user's saved
 * documents, `?doc=<document id>` starts a new one with that document
 * preselected, and neither lets the chat work out which document is needed.
 */
export default function CreatorFromUrl({ documents }: { documents: CreatorDocument[] }) {
  const params = useSearchParams();
  const savedId = params.get("id");
  const documentId = params.get("doc");
  // Keyed, so following a link to another document starts afresh.
  if (savedId) return <SavedCreator key={savedId} id={savedId} documents={documents} />;
  return <DocumentCreator key={documentId} documents={documents} initialDocumentId={documentId} />;
}

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "loaded"; draft: Draft };

function SavedCreator({ id, documents }: { id: string; documents: CreatorDocument[] }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getDraft(id, controller.signal).then(
      (draft) => setLoad({ status: "loaded", draft }),
      (error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof ApiError && error.status === 404
            ? "This document doesn't exist, or it was deleted."
            : error instanceof ApiError
              ? error.message
              : GENERIC_ERROR;
        setLoad({ status: "error", message });
      },
    );
    return () => controller.abort();
  }, [id]);

  if (load.status === "loaded") return <DocumentCreator documents={documents} saved={load.draft} />;
  if (load.status === "loading") {
    return (
      <p role="status" className="px-6 py-8 text-sm text-slate-600">
        Loading your document…
      </p>
    );
  }
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
      <div role="alert" className={`${cardClass} px-6 py-10 text-center`}>
        <h1 className="text-lg font-semibold text-heading">We couldn&apos;t open this document</h1>
        <p className="mt-2 text-sm text-raven">{load.message}</p>
        <Link href="/app/documents/" className={`${primaryButtonClass} mt-6 inline-block`}>
          Back to My documents
        </Link>
      </div>
    </main>
  );
}
