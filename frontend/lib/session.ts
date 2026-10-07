/**
 * Fake sign-in for the V1 foundation: the "session" is just the email the
 * user typed, kept in sessionStorage for the tab. There is no real
 * authentication yet and nothing is sent to the backend.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "prelegal.user";
const listeners = new Set<() => void>();

function readEmail(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked (e.g. some private modes)
  }
}

function writeEmail(email: string | null) {
  try {
    if (email === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, email);
  } catch {
    // Ignore: the user still gets into the platform, just without a name shown.
  }
  listeners.forEach((listener) => listener());
}

export const signIn = (email: string) => writeEmail(email.trim());
export const signOut = () => writeEmail(null);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in email, or null. Always null during prerendering. */
export function useSessionEmail(): string | null {
  return useSyncExternalStore(subscribe, readEmail, () => null);
}
