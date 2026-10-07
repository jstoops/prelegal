import path from "node:path";
import { vi } from "vitest";
import type { ChatMessage, ChatResult } from "@/lib/chat";
import { defaultNdaData, type NdaData } from "@/lib/nda";

/** The repo's real templates directory (tests run from frontend/). */
export const TEMPLATES_DIR = path.resolve(__dirname, "..", "..", "templates");

/** A fully filled-in NDA used across tests. */
export function filledNdaData(overrides: Partial<NdaData> = {}): NdaData {
  return {
    ...defaultNdaData(),
    purpose: "Exploring a joint go-to-market partnership.",
    effectiveDate: "2026-10-05",
    mndaTermType: "fixed",
    mndaTermYears: 2,
    confidentialityType: "fixed",
    confidentialityYears: 3,
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    modifications: "Section 6 retention period is limited to 90 days.",
    parties: [
      {
        printName: "Jane Doe",
        title: "CEO",
        company: "Acme, Inc.",
        noticeAddress: "legal@acme.com",
      },
      {
        printName: "John Roe",
        title: "CTO",
        company: "Globex LLC",
        noticeAddress: "1 Main St, Springfield, IL",
      },
    ],
    ...overrides,
  };
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  data: NdaData;
  today: string;
}

type ChatHandler = (body: ChatRequestBody) => ChatResult | Response | Promise<ChatResult | Response>;

/**
 * Replaces `fetch` with a fake `/api/chat`. The handler gets each request's
 * body and returns the reply (or a raw Response, e.g. for errors). The returned
 * list collects every request body.
 */
export function mockChatApi(handler: ChatHandler): ChatRequestBody[] {
  const requests: ChatRequestBody[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (url !== "/api/chat") throw new Error(`Unexpected fetch: ${String(url)}`);
    const body = JSON.parse(String(init?.body)) as ChatRequestBody;
    requests.push(body);
    const result = await handler(body);
    return result instanceof Response ? result : Response.json(result);
  });
  return requests;
}
