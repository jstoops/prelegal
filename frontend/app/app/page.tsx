import type { Metadata } from "next";
import Link from "next/link";
import DocumentList from "@/components/DocumentList";
import { loadDocuments } from "@/lib/catalog";
import { creatorHref } from "@/lib/document";
import { primaryButtonClass } from "@/lib/styles";

export const metadata: Metadata = { title: "Documents" };

export default async function DashboardPage() {
  const documents = await loadDocuments();
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-heading">Documents</h1>
      <p className="mt-1 text-sm text-slate-600">
        Choose an agreement to draft, and the AI assistant will help you fill it in.
      </p>

      <section
        aria-labelledby="ask-assistant"
        className="mt-6 flex flex-col gap-4 rounded-lg border border-brand bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
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

      <DocumentList documents={documents} />
    </main>
  );
}
