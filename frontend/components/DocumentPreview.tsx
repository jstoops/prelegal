import type { CreatorDocument } from "@/lib/catalog";
import {
  coverPageSections,
  partyHeadings,
  partyRows,
  STANDARD_TERMS_TITLE,
  type DocumentData,
} from "@/lib/document";
import type { Clause, Inline } from "@/lib/template";

function InlineText({ content }: { content: Inline[] }) {
  return content.map((part, i) => {
    let node;
    switch (part.kind) {
      case "term":
        node = <span className="font-semibold text-brand-strong">{part.text}</span>;
        break;
      case "link":
        node = (
          <a
            href={part.href}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-slate-400 underline-offset-2"
          >
            {part.text}
          </a>
        );
        break;
      default:
        node = part.text;
    }
    return part.bold ? <strong key={i}>{node}</strong> : <span key={i}>{node}</span>;
  });
}

function ClauseList({ clauses, depth = 0 }: { clauses: Clause[]; depth?: number }) {
  return (
    <ol className={depth === 0 ? "mt-6 space-y-4" : "mt-2 space-y-2 pl-6"}>
      {clauses.map((clause) => (
        <li key={clause.label} className="text-justify">
          {clause.label}{" "}
          {clause.heading && <strong>{clause.heading} </strong>}
          <InlineText content={clause.body} />
          {clause.children.length > 0 && <ClauseList clauses={clause.children} depth={depth + 1} />}
        </li>
      ))}
    </ol>
  );
}

interface DocumentPreviewProps {
  document: CreatorDocument;
  /** The document's data, with blank dates already shown as today. */
  data: DocumentData;
}

export default function DocumentPreview({ document, data }: DocumentPreviewProps) {
  const { definition, terms } = document;
  return (
    <article className="mx-auto max-w-[8.5in] bg-white px-10 py-12 font-serif text-[15px] leading-relaxed text-slate-900 shadow-lg ring-1 ring-slate-200 sm:px-16">
      <h2 className="text-center text-2xl font-bold">{definition.name}</h2>
      <p className="mt-6">
        <InlineText content={document.intro} />
      </p>

      <div className="mt-6 space-y-5">
        {coverPageSections(definition, data).map((section) => (
          <section key={section.heading}>
            <h3 className="text-base font-bold">{section.heading}</h3>
            {section.label && <p className="text-xs italic text-slate-500">{section.label}</p>}
            {section.lines?.map((line, i) => (
              <p key={i} className="mt-1 whitespace-pre-wrap">
                {line}
              </p>
            ))}
            {section.options && (
              <ul className="mt-1 space-y-1">
                {section.options.map((option) => (
                  <li key={option.text} className="flex gap-2">
                    <span aria-hidden className="font-sans">
                      {option.checked ? "☒" : "☐"}
                    </span>
                    <span className={option.checked ? "" : "text-slate-500"}>{option.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="mt-6">{definition.signingStatement}</p>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <td className="w-1/4 border border-slate-300 p-2" />
            {partyHeadings(definition).map((heading) => (
              <th key={heading} scope="col" className="border border-slate-300 p-2">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {partyRows(data).map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="border border-slate-300 p-2 text-left align-top font-semibold"
              >
                {row.label}
                {row.hint && (
                  <span className="block text-xs font-normal italic text-slate-500">{row.hint}</span>
                )}
              </th>
              {row.values.map((value, i) => (
                <td
                  key={i}
                  className={`${row.signature ? "h-16" : "h-10"} border border-slate-300 p-2 text-center align-top`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-slate-500">
        <InlineText content={document.attribution} />
      </p>

      <hr className="my-10 border-slate-300" />

      <h3 className="text-center text-xl font-bold">{STANDARD_TERMS_TITLE}</h3>
      <ClauseList clauses={terms.clauses} />
      {terms.attribution && (
        <p className="mt-6 text-xs text-slate-500">
          <InlineText content={terms.attribution} />
        </p>
      )}
    </article>
  );
}
