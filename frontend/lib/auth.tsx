"use client";

/**
 * Who is signed in. The session itself is an HttpOnly cookie the page can't
 * read, so on load the provider asks the backend (`GET /api/auth/me`); until
 * then the status is "loading". Pages decide what to show with `AuthGate`.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, setUnauthorizedHandler } from "@/lib/api";

export type AuthStatus = "loading" | "signedIn" | "signedOut";

interface AuthState {
  status: AuthStatus;
  /** The signed-in user's email. */
  email: string | null;
}

export interface Auth extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SIGNED_OUT: AuthState = { status: "signedOut", email: null };

const AuthContext = createContext<Auth | null>(null);

const emailOf = (account: unknown) => (account as { email: string }).email;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", email: null });

  useEffect(() => {
    // Any request refused for want of a session signs the user out here.
    setUnauthorizedHandler(() => setState(SIGNED_OUT));
    const controller = new AbortController();
    apiFetch("/api/auth/me", { signal: controller.signal, sessionRequired: false }).then(
      (account) => setState({ status: "signedIn", email: emailOf(account) }),
      () => {
        // Signed out, or the server is unreachable: either way, sign in.
        if (!controller.signal.aborted) setState(SIGNED_OUT);
      },
    );
    return () => {
      controller.abort();
      setUnauthorizedHandler(() => {});
    };
  }, []);

  const auth = useMemo<Auth>(() => {
    const start = (path: string) => async (email: string, password: string) => {
      const account = await apiFetch(path, {
        method: "POST",
        body: { email, password },
        sessionRequired: false,
      });
      setState({ status: "signedIn", email: emailOf(account) });
    };
    return {
      ...state,
      signIn: start("/api/auth/signin"),
      signUp: start("/api/auth/signup"),
      signOut: async () => {
        try {
          await apiFetch("/api/auth/signout", { method: "POST", sessionRequired: false });
        } catch {
          // Signed out here anyway; the session expires on its own.
        }
        setState(SIGNED_OUT);
      },
    };
  }, [state]);

  return <AuthContext value={auth}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
