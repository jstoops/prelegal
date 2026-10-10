import type { ReactNode } from "react";

const HIGHLIGHTS = [
  ["11 standard agreements", "NDAs, cloud service, data processing, pilots and more, from Common Paper."],
  ["Drafted by chatting", "Describe your deal and the AI assistant fills in the details for you."],
  ["Saved as you go", "Come back to any document later, or download it as a PDF."],
] as const;

/** The sign-in and sign-up pages: the product on one side, the form on the other. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section
        aria-label="About Prelegal"
        className="relative hidden overflow-hidden bg-heading px-12 py-16 text-white lg:flex lg:flex-col lg:justify-between"
      >
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-brand/25 blur-3xl" />
        <p className="relative text-xl font-bold tracking-tight">
          Pre<span className="text-brand-light">legal</span>
        </p>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Common legal agreements, drafted in minutes.
          </h2>
          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(([title, text]) => (
              <li key={title} className="flex gap-4">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-light" />
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-slate-300">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-300">
          Templates by Common Paper, used under CC BY 4.0.
        </p>
      </section>

      <div className="flex flex-col items-center justify-center bg-white px-4 py-12 sm:px-8">
        <p className="mb-10 text-xl font-bold tracking-tight text-heading lg:hidden">
          Pre<span className="text-brand-strong">legal</span>
        </p>
        {children}
      </div>
    </main>
  );
}
