import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut, useSessionEmail } from "@/lib/session";

afterEach(() => sessionStorage.clear());

describe("fake session", () => {
  it("starts signed out", () => {
    const { result } = renderHook(() => useSessionEmail());
    expect(result.current).toBeNull();
  });

  it("remembers the trimmed email for the tab and updates subscribers", () => {
    const { result } = renderHook(() => useSessionEmail());
    act(() => signIn("  jane@acme.com "));
    expect(result.current).toBe("jane@acme.com");
    expect(sessionStorage.getItem("prelegal.user")).toBe("jane@acme.com");
  });

  it("forgets the email on sign out", () => {
    signIn("jane@acme.com");
    const { result } = renderHook(() => useSessionEmail());
    expect(result.current).toBe("jane@acme.com");
    act(() => signOut());
    expect(result.current).toBeNull();
    expect(sessionStorage.getItem("prelegal.user")).toBeNull();
  });

  it("still works when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    const { result } = renderHook(() => useSessionEmail());
    expect(() => act(() => signIn("jane@acme.com"))).not.toThrow();
    expect(result.current).toBeNull();
  });
});
