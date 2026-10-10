"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ApiError, GENERIC_ERROR } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { alertClass, inputClass, linkClass, primaryButtonClass } from "@/lib/styles";

/** `MIN_PASSWORD_LENGTH` in backend accounts.py. */
export const MIN_PASSWORD_LENGTH = 8;

const MODES = {
  signin: {
    title: "Sign in",
    intro: "Welcome back. Sign in to pick up where you left off.",
    submit: "Sign in",
    pending: "Signing in…",
    switchText: "New to Prelegal?",
    switchLink: "Create an account",
    switchHref: "/signup/",
  },
  signup: {
    title: "Create your account",
    intro: "Start drafting agreements in minutes. It's free.",
    submit: "Create account",
    pending: "Creating account…",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/",
  },
} as const;

/**
 * Sign in or sign up. On success the auth state changes and the page's
 * `AuthGate` takes the user into the app.
 */
export default function AuthForm({ mode }: { mode: keyof typeof MODES }) {
  const text = MODES[mode];
  const signingUp = mode === "signup";
  const { signIn, signUp } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const hintId = useId();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    try {
      await (signingUp ? signUp : signIn)(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
      setPending(false);
    }
  };

  // Inputs point at the error (and the password hint) for screen readers.
  const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-heading">{text.title}</h1>
      <p className="mt-2 text-sm text-raven">{text.intro}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        {error && (
          <p id={errorId} role="alert" className={alertClass}>
            {error}
          </p>
        )}
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(!!error && errorId)}
            className={`${inputClass} mt-1.5`}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
            minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
            maxLength={128}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(!!error && errorId, signingUp && hintId)}
            className={`${inputClass} mt-1.5`}
          />
          {signingUp && (
            <span id={hintId} className="mt-1.5 block text-xs text-raven">
              At least {MIN_PASSWORD_LENGTH} characters.
            </span>
          )}
        </label>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButtonClass} w-full py-2.5 disabled:cursor-wait disabled:opacity-70`}
        >
          {pending ? text.pending : text.submit}
        </button>
      </form>

      <p className="mt-8 text-sm text-raven">
        {text.switchText}{" "}
        <Link href={text.switchHref} className={linkClass}>
          {text.switchLink}
        </Link>
      </p>
    </div>
  );
}
