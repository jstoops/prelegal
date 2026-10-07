"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSessionEmail } from "@/lib/session";
import { secondaryButtonClass } from "@/lib/styles";

export default function AppHeader() {
  const router = useRouter();
  const email = useSessionEmail();

  const handleSignOut = () => {
    signOut();
    router.push("/");
  };

  return (
    <header className="border-b-4 border-brand bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/app/"
          className="rounded-sm text-lg font-bold tracking-tight text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Prelegal
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          {email && (
            <span className="truncate text-sm text-raven" title={email}>
              {email}
            </span>
          )}
          <button type="button" onClick={handleSignOut} className={secondaryButtonClass}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
