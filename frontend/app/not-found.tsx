import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold text-heading">Page not found</h1>
      <p className="text-sm text-slate-600">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/app/"
        className="text-sm font-semibold text-brand-strong underline underline-offset-4 hover:text-brand-stronger"
      >
        Go to your documents
      </Link>
    </main>
  );
}
