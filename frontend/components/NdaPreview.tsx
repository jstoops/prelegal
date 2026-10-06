import { coverPageSections, partyRows, type NdaData } from "@/lib/nda";
import type { Inline, NdaTemplate } from "@/lib/nda-template";

function InlineText({ content }: { content: Inline[] }) {
  return content.map((part, i) => {
    switch (part.kind) {
      case "bold":
        return <strong key={i}>{part.text}</strong>;
      case "term":
        return (
          <span key={i} className="font-semibold text-indigo-800">
            {part.text}
          </span>
        );
      case "link":
        return (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-slate-400 underline-offset-2"
          >
            {part.text}
          </a>
        );
      default:
        return part.text;
    }
  });
}

interface NdaPreviewProps {
  data: NdaData;
  template: NdaTemplate;
}

export default function NdaPreview({ data, template }: NdaPreviewProps) {
  return (
    <article className="mx-auto max-w-[8.5in] bg-white px-10 py-12 font-serif text-[15px] leading-relaxed text-slate-900 shadow-lg ring-1 ring-slate-200 sm:px-16">
      <h1 className="text-center text-2xl font-bold">
        Mutual Non-Disclosure Agreement
      </h1>
      <p className="mt-6">
        <InlineText content={template.coverIntro} />
      </p>

      <div className="mt-6 space-y-5">
        {coverPageSections(data).map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-bold">{section.heading}</h2>
            {section.label && (
              <p className="text-xs italic text-slate-500">{section.label}</p>
            )}
            {section.lines?.map((line) => (
              <p key={line} className="mt-1 whitespace-pre-wrap">
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
                    <span className={option.checked ? "" : "text-slate-400"}>
                      {option.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="mt-6">
        By signing this Cover Page, each party agrees to enter into this MNDA as
        of the Effective Date.
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-1/4 border border-slate-300 p-2" />
            <th className="border border-slate-300 p-2">PARTY 1</th>
            <th className="border border-slate-300 p-2">PARTY 2</th>
          </tr>
        </thead>
        <tbody>
          {partyRows(data).map((row) => (
            <tr key={row.label}>
              <th className="border border-slate-300 p-2 text-left align-top font-semibold">
                {row.label}
                {row.hint && (
                  <span className="block text-xs font-normal italic text-slate-500">
                    {row.hint}
                  </span>
                )}
              </th>
              {row.values.map((value, i) => (
                <td
                  key={i}
                  className="h-10 border border-slate-300 p-2 text-center align-top"
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-slate-500">
        <InlineText content={template.coverAttribution} />
      </p>

      <hr className="my-10 border-slate-300" />

      <h2 className="text-center text-xl font-bold">Standard Terms</h2>
      <ol className="mt-6 space-y-4">
        {template.standardTerms.map((section) => (
          <li key={section.number} className="text-justify">
            {section.number}. <strong>{section.title}</strong>.{" "}
            <InlineText content={section.body} />
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-slate-500">
        <InlineText content={template.standardTermsAttribution} />
      </p>
    </article>
  );
}
