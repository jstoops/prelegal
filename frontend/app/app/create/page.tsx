import type { Metadata } from "next";
import { Suspense } from "react";
import CreatorFromUrl from "@/components/CreatorFromUrl";
import { loadCreatorDocuments } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Document Creator",
  description:
    "Chat with an AI assistant to draft a Common Paper agreement and download it as a PDF.",
};

export default async function CreatePage() {
  const documents = await loadCreatorDocuments();
  return (
    // The preselected document comes from the URL, which is only known in the
    // browser: the page is a static export.
    <Suspense fallback={<p className="px-6 py-8 text-sm text-slate-600">Loading…</p>}>
      <CreatorFromUrl documents={documents} />
    </Suspense>
  );
}
