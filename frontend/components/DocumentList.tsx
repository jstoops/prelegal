import Link from "next/link";
import type { CatalogDocument } from "@/lib/catalog";
import { primaryButtonClass } from "@/lib/styles";

export default function DocumentList({ documents }: { documents: CatalogDocument[] }) {
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <li
          key={doc.name}
          className={`flex flex-col rounded-lg border bg-white p-5 shadow-sm ${
            doc.href ? "border-brand" : "border-slate-200"
          }`}
        >
          <h2 className="text-base font-semibold text-heading">{doc.name}</h2>
          <p className="mt-2 flex-1 text-sm text-raven">{doc.description}</p>
          <div className="mt-4">
            {doc.href ? (
              <Link
                href={doc.href}
                aria-label={`Create ${doc.name}`}
                className={`${primaryButtonClass} inline-block`}
              >
                Create
              </Link>
            ) : (
              <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Coming soon
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
