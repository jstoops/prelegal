"use client";

import { useSearchParams } from "next/navigation";
import DocumentCreator from "@/components/DocumentCreator";
import type { CreatorDocument } from "@/lib/catalog";

/** The creator, with the document from `?doc=<id>` preselected (if any). */
export default function CreatorFromUrl({ documents }: { documents: CreatorDocument[] }) {
  const documentId = useSearchParams().get("doc");
  // Keyed, so following a link to another document starts afresh.
  return <DocumentCreator key={documentId} documents={documents} initialDocumentId={documentId} />;
}
