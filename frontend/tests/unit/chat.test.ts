import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatError, sendChat, type ChatMessage } from "@/lib/chat";
import { defaultNdaData } from "@/lib/nda";
import { filledNdaData, mockChatApi } from "../fixtures";

const history: ChatMessage[] = [
  { role: "assistant", content: "Who are the parties?" },
  { role: "user", content: "Acme and Globex." },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 5, 23, 30)); // late on Oct 5, local time
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sendChat", () => {
  it("posts the history, the NDA and the user's local date", async () => {
    const requests = mockChatApi(() => ({ reply: "Thanks!", data: filledNdaData() }));
    const result = await sendChat(history, defaultNdaData());

    expect(result).toEqual({ reply: "Thanks!", data: filledNdaData() });
    expect(requests).toEqual([{ messages: history, data: defaultNdaData(), today: "2026-10-05" }]);
    const [, init] = vi.mocked(fetch).mock.lastCall!;
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("throws the server's error message", async () => {
    mockChatApi(() =>
      Response.json({ detail: "The AI assistant isn't configured." }, { status: 503 }),
    );
    await expect(sendChat([], defaultNdaData())).rejects.toEqual(
      new ChatError("The AI assistant isn't configured."),
    );
  });

  it.each([
    ["a validation error", Response.json({ detail: [{ msg: "bad" }] }, { status: 422 })],
    ["a non-JSON error", new Response("<h1>Bad gateway</h1>", { status: 502 })],
    ["a malformed reply", Response.json({ reply: "Hi" })],
    ["a non-JSON reply", new Response("ok")],
  ])("throws a generic message for %s", async (_, response) => {
    mockChatApi(() => response);
    await expect(sendChat([], defaultNdaData())).rejects.toEqual(
      new ChatError("The AI assistant is unavailable. Please try again."),
    );
  });

  it("reports network failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(sendChat([], defaultNdaData())).rejects.toEqual(
      new ChatError("Couldn't reach the server. Check your connection and try again."),
    );
  });

  it("passes aborts through untouched", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      controller.abort();
      throw abort;
    });
    await expect(sendChat([], defaultNdaData(), controller.signal)).rejects.toBe(abort);
  });
});
