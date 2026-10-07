/** Tailwind class strings shared by forms and buttons across the app. */

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand aria-invalid:border-red-600";

const buttonBase =
  "rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const primaryButtonClass = `${buttonBase} bg-brand-strong hover:bg-brand-stronger`;

export const secondaryButtonClass = `${buttonBase} bg-raven hover:bg-raven-hover`;
