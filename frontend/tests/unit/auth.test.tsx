import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { apiFetch } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { meRoute, mockApi } from "../fixtures";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const renderAuth = () => renderHook(() => useAuth(), { wrapper });

describe("AuthProvider", () => {
  it("is loading until the session is checked, then signed in", async () => {
    mockApi({ "GET /api/auth/me": meRoute("jane@acme.com") });
    const { result } = renderAuth();
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    expect(result.current.email).toBe("jane@acme.com");
  });

  it("is signed out without a session", async () => {
    mockApi({ "GET /api/auth/me": meRoute(null) });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.email).toBeNull();
  });

  it("is signed out when the server can't be reached", async () => {
    mockApi({ "GET /api/auth/me": () => new Response("down", { status: 502 }) });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it.each([
    ["signIn", "/api/auth/signin"],
    ["signUp", "/api/auth/signup"],
  ] as const)("%s posts the credentials and signs in", async (method, path) => {
    const requests = mockApi({
      "GET /api/auth/me": meRoute(null),
      [`POST ${path}`]: () => ({ email: "jane@acme.com" }),
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(() => result.current[method]("Jane@Acme.com", "pa55word!"));

    expect(requests.at(-1)).toEqual({
      method: "POST",
      url: path,
      body: { email: "Jane@Acme.com", password: "pa55word!" },
    });
    expect(result.current).toMatchObject({ status: "signedIn", email: "jane@acme.com" });
  });

  it("stays signed out and rethrows when credentials are refused", async () => {
    mockApi({
      "GET /api/auth/me": meRoute(null),
      "POST /api/auth/signin": () =>
        Response.json({ detail: "Incorrect email or password." }, { status: 401 }),
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await expect(act(() => result.current.signIn("jane@acme.com", "wrong"))).rejects.toThrow(
      "Incorrect email or password.",
    );
    expect(result.current.status).toBe("signedOut");
  });

  it("signs out, even if the server can't be reached", async () => {
    mockApi({
      "GET /api/auth/me": meRoute("jane@acme.com"),
      "POST /api/auth/signout": () => new Response("down", { status: 502 }),
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(() => result.current.signOut());

    expect(result.current).toMatchObject({ status: "signedOut", email: null });
  });

  it("signs out when any request finds the session has ended", async () => {
    mockApi({
      "GET /api/auth/me": meRoute("jane@acme.com"),
      "GET /api/documents": () => Response.json({ detail: "Please sign in to continue." }, { status: 401 }),
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(() => apiFetch("/api/documents").catch(() => {}));

    expect(result.current.status).toBe("signedOut");
  });

  it("must be used inside the provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used inside <AuthProvider>");
  });
});
