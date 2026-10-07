import Link from "next/link";
import { creatorHref, type DocumentDefinition } from "@/lib/document";
import { primaryButtonClass } from "@/lib/styles";

type ListedDocument = Pick<DocumentDefinition, "id" | "name" | "description">;

export default function DocumentList({ documents }: { documents: ListedDocument[] }) {
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <li key={doc.id} className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-heading">{doc.name}</h2>
          <p className="mt-2 flex-1 text-sm text-raven">{doc.description}</p>
          <div className="mt-4">
            <Link
              href={creatorHref(doc.id)}
              aria-label={`Create ${doc.name}`}
              className={`${primaryButtonClass} inline-block`}
            >
              Create
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
