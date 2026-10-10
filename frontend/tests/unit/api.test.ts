import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, setUnauthorizedHandler } from "@/lib/api";
import { mockApi } from "../fixtures";

afterEach(() => setUnauthorizedHandler(() => {}));

const unauthorized = () => Response.json({ detail: "Please sign in to continue." }, { status: 401 });

describe("apiFetch", () => {
  it("sends JSON with the session cookie and parses the reply", async () => {
    const requests = mockApi({ "POST /api/thing": ({ body }) => ({ echo: body }) });

    expect(await apiFetch("/api/thing", { method: "POST", body: { a: 1 } })).toEqual({ echo: { a: 1 } });
    expect(requests).toEqual([{ method: "POST", url: "/api/thing", body: { a: 1 } }]);
    const [, init] = vi.mocked(fetch).mock.lastCall!;
    expect(init).toMatchObject({
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("sends no body or content type on GET", async () => {
    mockApi({ "GET /api/thing": () => ({}) });
    await apiFetch("/api/thing");
    const [, init] = vi.mocked(fetch).mock.lastCall!;
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toBeUndefined();
  });

  it("resolves to undefined for 204 No Content", async () => {
    mockApi({ "DELETE /api/thing": () => undefined });
    expect(await apiFetch("/api/thing", { method: "DELETE" })).toBeUndefined();
  });

  it("throws the server's message with the status", async () => {
    mockApi({ "GET /api/thing": () => Response.json({ detail: "Document not found." }, { status: 404 }) });
    const error = await apiFetch("/api/thing").catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Document not found.", status: 404 });
  });

  it("shows the backend's own validation messages", async () => {
    mockApi({
      "POST /api/thing": () =>
        Response.json({ detail: [{ msg: "Value error, Enter a valid email address." }] }, { status: 422 }),
    });
    await expect(apiFetch("/api/thing", { method: "POST", body: {} })).rejects.toThrow("Enter a valid email address.");
  });

  it.each([
    ["a generic validation error", () => Response.json({ detail: [{ msg: "Field required" }] }, { status: 422 })],
    ["a non-JSON error", () => new Response("<h1>Bad gateway</h1>", { status: 502 })],
    ["a non-JSON success", () => new Response("ok")],
  ])("falls back to the given message for %s", async (_, response) => {
    mockApi({ "GET /api/thing": response });
    await expect(apiFetch("/api/thing", { fallbackError: "Nope." })).rejects.toThrow("Nope.");
  });

  it("reports network failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/api/thing")).rejects.toThrow("Couldn't reach the server. Check your connection and try again.");
  });

  it("passes aborts through untouched", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      controller.abort();
      throw abort;
    });
    await expect(apiFetch("/api/thing", { signal: controller.signal })).rejects.toBe(abort);
  });

  it("reports an ended session on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockApi({ "GET /api/thing": unauthorized });

    await expect(apiFetch("/api/thing")).rejects.toThrow("Please sign in to continue.");
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("leaves expected 401s (e.g. a wrong password) to the caller", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockApi({ "POST /api/thing": unauthorized });

    await expect(
      apiFetch("/api/thing", { method: "POST", body: {}, sessionRequired: false }),
    ).rejects.toThrow("Please sign in to continue.");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
