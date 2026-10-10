import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import CreatorFromUrl from "@/components/CreatorFromUrl";
import type { CreatorDocument } from "@/lib/catalog";
import { creatorDocuments, filledNdaData, mockApi } from "../fixtures";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

let documents: CreatorDocument[];
beforeAll(async () => {
  documents = await creatorDocuments();
});

beforeEach(() => {
  search = new URLSearchParams();
});

const SAVED = {
  id: "draft-1",
  documentId: "mutual-nda",
  title: "Mutual Non-Disclosure Agreement - Acme, Inc. & Globex LLC",
  updatedAt: "2026-10-09T12:00:00Z",
  data: filledNdaData(),
  messages: [
    { role: "assistant", content: "Who are the parties?" },
    { role: "user", content: "Acme and Globex" },
    { role: "assistant", content: "Great, anything else?" },
  ],
};

describe("CreatorFromUrl", () => {
  it("starts a new document from ?doc=", async () => {
    search = new URLSearchParams("doc=pilot-agreement");
    const requests = mockApi({ "POST /api/chat": ({ body }) => ({ reply: "Hi!", data: (body as { data: unknown }).data, savedId: null }) });
    render(<CreatorFromUrl documents={documents} />);
    expect(await screen.findByText("Hi!")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pilot Agreement");
    expect(requests).toHaveLength(1);
  });

  it("continues a saved document from ?id=", async () => {
    search = new URLSearchParams("id=draft-1&doc=pilot-agreement");
    const requests = mockApi({ "GET /api/documents/draft-1": () => SAVED });
    render(<CreatorFromUrl documents={documents} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your document…");
    expect(await screen.findByText("Great, anything else?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mutual Non-Disclosure Agreement");
    expect(requests.map((r) => r.url)).toEqual(["/api/documents/draft-1"]); // no greeting
  });

  it("explains when a saved document can't be found", async () => {
    search = new URLSearchParams("id=gone");
    mockApi({ "GET /api/documents/gone": () => Response.json({ detail: "Document not found." }, { status: 404 }) });
    render(<CreatorFromUrl documents={documents} />);

    expect(await screen.findByRole("heading", { name: "We couldn't open this document" })).toBeInTheDocument();
    expect(screen.getByText("This document doesn't exist, or it was deleted.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My documents" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/documents\/?$/),
    );
  });

  it("passes on other errors", async () => {
    search = new URLSearchParams("id=old");
    mockApi({
      "GET /api/documents/old": () =>
        Response.json({ detail: "This document can no longer be opened." }, { status: 422 }),
    });
    render(<CreatorFromUrl documents={documents} />);
    expect(await screen.findByText("This document can no longer be opened.")).toBeInTheDocument();
  });
});
