import { describe, expect, it } from "vitest";
import { deleteDraft, draftHref, formatUpdated, getDraft, listDrafts } from "@/lib/drafts";
import { filledNdaData, mockApi } from "../fixtures";

const SUMMARY = { id: "abc", documentId: "mutual-nda", title: "Mutual NDA", updatedAt: "2026-10-09T12:00:00Z" };

describe("drafts client", () => {
  it("lists the user's documents", async () => {
    mockApi({ "GET /api/documents": () => ({ documents: [SUMMARY] }) });
    expect(await listDrafts()).toEqual([SUMMARY]);
  });

  it("rejects a malformed list", async () => {
    mockApi({ "GET /api/documents": () => ({ nope: true }) });
    await expect(listDrafts()).rejects.toThrow("Couldn't load your documents. Please try again.");
  });

  it("opens a document, escaping its id", async () => {
    const draft = { ...SUMMARY, data: filledNdaData(), messages: [] };
    const requests = mockApi({ "GET /api/documents/a%2Fb": () => draft });
    expect(await getDraft("a/b")).toEqual(draft);
    expect(requests[0].url).toBe("/api/documents/a%2Fb");
  });

  it("passes on a missing document's 404", async () => {
    mockApi({ "GET /api/documents/abc": () => Response.json({ detail: "Document not found." }, { status: 404 }) });
    await expect(getDraft("abc")).rejects.toMatchObject({ status: 404, message: "Document not found." });
  });

  it("deletes a document", async () => {
    const requests = mockApi({ "DELETE /api/documents/abc": () => undefined });
    await deleteDraft("abc");
    expect(requests).toEqual([{ method: "DELETE", url: "/api/documents/abc", body: undefined }]);
  });

  it("links to the creator", () => {
    expect(draftHref("abc")).toBe("/app/create/?id=abc");
  });
});

describe("formatUpdated", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it.each([
    ["2026-10-09T11:59:30Z", "just now"],
    ["2026-10-09T11:59:00Z", "1 minute ago"],
    ["2026-10-09T11:15:00Z", "45 minutes ago"],
    ["2026-10-09T09:00:00Z", "3 hours ago"],
    ["2026-10-07T12:00:00Z", "Oct 7, 2026"],
    ["not a date", ""],
  ])("%s → %s", (iso, expected) => {
    expect(formatUpdated(iso, now)).toBe(expected);
  });
});
