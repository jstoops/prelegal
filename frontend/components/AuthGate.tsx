"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth, type AuthStatus } from "@/lib/auth";

/** Who may see the page, and where everyone else goes. */
const RULES = {
  user: { allowed: "signedIn", redirect: "/" },
  guest: { allowed: "signedOut", redirect: "/app/" },
} as const satisfies Record<string, { allowed: AuthStatus; redirect: string }>;

interface AuthGateProps {
  /** "user": signed-in users only. "guest": signed-out visitors only (sign-in pages). */
  require: keyof typeof RULES;
  children: ReactNode;
}

/**
 * Shows `children` only to the right visitors and sends everyone else on.
 * Pages are prerendered before anyone is known, so until the session is
 * checked (and while redirecting) only a neutral loading state is shown.
 */
export default function AuthGate({ require, children }: AuthGateProps) {
  const { status } = useAuth();
  const router = useRouter();
  const { allowed, redirect } = RULES[require];
  const redirecting = status !== "loading" && status !== allowed;

  useEffect(() => {
    if (redirecting) router.replace(redirect);
  }, [redirecting, redirect, router]);

  if (status === allowed) return children;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-24">
      <p role="status" className="flex items-center gap-3 text-sm text-slate-600">
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand"
        />
        Loading…
      </p>
    </div>
  );
}
