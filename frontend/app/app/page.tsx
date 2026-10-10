import type { Metadata } from "next";
import Link from "next/link";
import DocumentList from "@/components/DocumentList";
import SavedDocumentList from "@/components/SavedDocumentList";
import { loadDocuments } from "@/lib/catalog";
import { creatorHref, documentNames } from "@/lib/document";
import { cardClass, primaryButtonClass } from "@/lib/styles";

export const metadata: Metadata = { title: "New document" };

export default async function DashboardPage() {
  const documents = await loadDocuments();
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-heading">New document</h1>
      <p className="mt-2 text-sm text-slate-600">
        Choose an agreement to draft, and the AI assistant will help you fill it in.
      </p>

      <section
        aria-labelledby="ask-assistant"
        className={`${cardClass} mt-8 flex flex-col gap-4 border-brand/60 bg-gradient-to-r from-white to-orange-50/60 p-6 sm:flex-row sm:items-center sm:justify-between`}
      >
        <div>
          <h2 id="ask-assistant" className="text-base font-semibold text-heading">
            Not sure which agreement you need?
          </h2>
          <p className="mt-1 text-sm text-raven">
            Describe your situation and the assistant will suggest the right document.
          </p>
        </div>
        <Link href={creatorHref()} className={`${primaryButtonClass} inline-block shrink-0 text-center`}>
          Ask the assistant
        </Link>
      </section>

      {/* Hidden until the user has saved documents. */}
      <div className="mt-10 empty:hidden">
        <SavedDocumentList documentNames={documentNames(documents)} variant="recent" />
      </div>

      <section aria-labelledby="templates" className="mt-10">
        <h2 id="templates" className="text-lg font-semibold text-heading">
          Agreement templates
        </h2>
        <DocumentList documents={documents} />
      </section>
    </main>
  );
}
