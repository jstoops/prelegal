import { readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import { loadCreatorDocuments, type CreatorDocument } from "@/lib/catalog";
import type { ChatMessage, ChatResult } from "@/lib/chat";
import {
  defaultDocumentData,
  type DocumentData,
  type DocumentDefinition,
  type FieldValue,
  type Party,
} from "@/lib/document";

/** The repo root (tests run from frontend/). */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");

/** The repo's real document definitions. */
export const DOCUMENTS: DocumentDefinition[] = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "documents.json"), "utf8"),
).documents;

export function definition(id: string): DocumentDefinition {
  const doc = DOCUMENTS.find((d) => d.id === id);
  if (!doc) throw new Error(`No document "${id}"`);
  return doc;
}

export const NDA = definition("mutual-nda");

/** Every document as the creator page gets them (parsed templates included). */
export const creatorDocuments = (): Promise<CreatorDocument[]> => loadCreatorDocuments(REPO_ROOT);

export const FILLED_PARTIES: [Party, Party] = [
  { printName: "Jane Doe", title: "CEO", company: "Acme, Inc.", noticeAddress: "legal@acme.com" },
  { printName: "John Roe", title: "CTO", company: "Globex LLC", noticeAddress: "1 Main St, Springfield, IL" },
];

/** A document at its defaults, with `fields` overriding them. */
export function documentData(
  doc: DocumentDefinition,
  fields: Record<string, FieldValue> = {},
  parties?: [Party, Party],
): DocumentData {
  const data = defaultDocumentData(doc);
  return { ...data, fields: { ...data.fields, ...fields }, parties: parties ?? data.parties };
}

/** A fully filled-in NDA used across tests. */
export function filledNdaData(fields: Record<string, FieldValue> = {}): DocumentData {
  return documentData(
    NDA,
    {
      purpose: "Exploring a joint go-to-market partnership.",
      effectiveDate: "2026-10-05",
      mndaTermType: "fixed",
      mndaTermYears: 2,
      confidentialityType: "fixed",
      confidentialityYears: 3,
      governingLaw: "Delaware",
      jurisdiction: "New Castle, DE",
      modifications: "Section 6 retention period is limited to 90 days.",
      ...fields,
    },
    structuredClone(FILLED_PARTIES),
  );
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  data: DocumentData;
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
