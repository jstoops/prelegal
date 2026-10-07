import type { Metadata } from "next";
import DocumentList from "@/components/DocumentList";
import { loadCatalog } from "@/lib/catalog";

export const metadata: Metadata = { title: "Documents" };

export default async function DashboardPage() {
  const documents = await loadCatalog();
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-heading">Documents</h1>
      <p className="mt-1 text-sm text-slate-600">
        Choose an agreement to draft. More documents are on the way.
      </p>
      <DocumentList documents={documents} />
    </main>
  );
}
