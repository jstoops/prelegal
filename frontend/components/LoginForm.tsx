"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { signIn } from "@/lib/session";
import { inputClass, primaryButtonClass } from "@/lib/styles";

/**
 * Fake sign-in: any email and password are accepted. The browser's own
 * validation requires both fields; nothing is sent to a server.
 */
export default function LoginForm() {
  const router = useRouter();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    signIn(String(email ?? ""));
    router.push("/app/");
  };

  return (
    <div className="w-full max-w-sm rounded-lg border-t-4 border-brand bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-strong">
        Prelegal
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-heading">Sign in</h1>
      <p className="mt-1 text-sm text-raven">Draft common legal agreements in minutes.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`${inputClass} mt-1.5`}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={`${inputClass} mt-1.5`}
          />
        </label>
        <button type="submit" className={`${primaryButtonClass} w-full`}>
          Sign in
        </button>
      </form>

      <p className="mt-6 text-xs text-raven">
        Demo only: any email and password will sign you in.
      </p>
    </div>
  );
}
