"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { outlineButtonClass } from "@/lib/styles";

const NAV = [
  { href: "/app/", label: "New document" },
  { href: "/app/documents/", label: "My documents" },
] as const;

const normalize = (path: string) => (path.endsWith("/") ? path : `${path}/`);

export default function AppHeader() {
  const { email, signOut } = useAuth();
  const pathname = normalize(usePathname() ?? "");

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="h-1 bg-brand" />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/app/"
            className="rounded-sm text-lg font-bold tracking-tight text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Pre<span className="text-brand-strong">legal</span>
          </Link>
          <nav aria-label="Main">
            <ul className="flex items-center gap-1">
              {NAV.map(({ href, label }) => {
                const current = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={current ? "page" : undefined}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                        current ? "bg-slate-100 text-heading" : "text-raven hover:bg-slate-50 hover:text-heading"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          {email && (
            <span className="hidden truncate text-sm text-raven sm:inline" title={email}>
              {email}
            </span>
          )}
          {/* The gate sends signed-out users to the sign-in page. */}
          <button type="button" onClick={() => void signOut()} className={`${outlineButtonClass} py-1.5`}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
