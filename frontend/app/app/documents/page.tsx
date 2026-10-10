import type { Metadata } from "next";
import Link from "next/link";
import SavedDocumentList from "@/components/SavedDocumentList";
import { loadDocuments } from "@/lib/catalog";
import { documentNames } from "@/lib/document";
import { primaryButtonClass } from "@/lib/styles";

export const metadata: Metadata = { title: "My documents" };

export default async function MyDocumentsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-heading">My documents</h1>
          <p className="mt-2 text-sm text-slate-600">
            Everything you draft is saved here as you go. Open a document to keep working on it.
          </p>
        </div>
        <Link href="/app/" className={`${primaryButtonClass} inline-block`}>
          New document
        </Link>
      </div>
      <div className="mt-8">
        <SavedDocumentList documentNames={documentNames(await loadDocuments())} />
      </div>
    </main>
  );
}
