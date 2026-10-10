import { DRAFT_DISCLAIMER } from "@/lib/document";

/** On every page: the draft disclaimer and the templates' licence. */
export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-raven sm:px-6 md:flex-row md:items-start md:justify-between md:gap-12">
        <p className="max-w-3xl">
          <strong className="font-semibold text-heading">Draft documents only.</strong> {DRAFT_DISCLAIMER}
        </p>
        <p className="shrink-0">
          Templates by{" "}
          <a
            href="https://commonpaper.com"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-heading"
          >
            Common Paper
          </a>
          , licensed under{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-heading"
          >
            CC BY 4.0
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
