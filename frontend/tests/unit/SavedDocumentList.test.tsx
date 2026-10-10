import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import SavedDocumentList from "@/components/SavedDocumentList";
import type { DraftSummary } from "@/lib/drafts";
import { mockApi, type RouteHandler } from "../fixtures";

const NAMES = { "mutual-nda": "Mutual Non-Disclosure Agreement", "pilot-agreement": "Pilot Agreement" };

const draft = (id: string, title: string, documentId = "mutual-nda"): DraftSummary => ({
  id,
  documentId,
  title,
  updatedAt: new Date().toISOString(),
});

const DRAFTS = [
  draft("a", "Mutual Non-Disclosure Agreement - Acme & Globex"),
  draft("b", "Pilot Agreement", "pilot-agreement"),
  draft("c", "Mutual Non-Disclosure Agreement"),
  draft("d", "Mutual Non-Disclosure Agreement - Initech"),
];

function renderList(routes: Record<string, RouteHandler>, variant?: "all" | "recent") {
  const requests = mockApi(routes);
  const view = render(<SavedDocumentList documentNames={NAMES} variant={variant} />);
  return { requests, user: userEvent.setup(), ...view };
}

const rows = () => within(screen.getAllByRole("list")[0]).getAllByRole("listitem");

describe("SavedDocumentList", () => {
  it("shows a loading state, then the documents with links to open them", async () => {
    renderList({ "GET /api/documents": () => ({ documents: DRAFTS }) });
    expect(screen.getByRole("status", { name: "Loading your documents" })).toBeInTheDocument();

    expect(await screen.findAllByRole("listitem")).toHaveLength(4);
    const [first] = rows();
    expect(within(first).getByRole("link", { name: "Mutual Non-Disclosure Agreement - Acme & Globex" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/create\/?\?id=a$/), // see AppHeader.test
    );
    expect(within(first).getByRole("link", { name: "Open Mutual Non-Disclosure Agreement - Acme & Globex" })).toBeInTheDocument();
    expect(within(first).getByText("Edited just now")).toBeInTheDocument();
  });

  it("names the document type only when the title doesn't", async () => {
    renderList({ "GET /api/documents": () => ({ documents: [draft("x", "Custom title")] }) });
    expect(await screen.findByText("Mutual Non-Disclosure Agreement · Edited just now")).toBeInTheDocument();
  });

  it("invites the user to start when there are no documents", async () => {
    renderList({ "GET /api/documents": () => ({ documents: [] }) });
    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a new document" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/?$/),
    );
  });

  it("reports errors and retries", async () => {
    let fail = true;
    const { user } = renderList({
      "GET /api/documents": () =>
        fail ? new Response("down", { status: 502 }) : { documents: DRAFTS.slice(0, 1) },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your documents. Please try again.");

    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
  });

  describe("deleting", () => {
    it("asks for confirmation, then removes the document", async () => {
      const { requests, user } = renderList({
        "GET /api/documents": () => ({ documents: DRAFTS.slice(0, 2) }),
        "DELETE /api/documents/b": () => undefined,
      });
      await screen.findAllByRole("listitem");

      await user.click(screen.getByRole("button", { name: "Delete Pilot Agreement" }));
      expect(screen.getByText("Delete this document?")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
      expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(rows()).toHaveLength(1));
      expect(screen.queryByText("Pilot Agreement")).not.toBeInTheDocument();
      expect(requests.at(-1)).toMatchObject({ method: "DELETE", url: "/api/documents/b" });
      // The focused button is gone, so focus moves to the list rather than the page.
      expect(screen.getByRole("list", { name: "Your documents" })).toHaveFocus();
    });

    it("moves focus to the empty state after deleting the last document", async () => {
      const { user } = renderList({
        "GET /api/documents": () => ({ documents: DRAFTS.slice(1, 2) }),
        "DELETE /api/documents/b": () => undefined,
      });
      await screen.findAllByRole("listitem");
      await user.click(screen.getByRole("button", { name: "Delete Pilot Agreement" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByRole("heading", { name: "No documents yet" })).toHaveFocus();
    });

    it("can be cancelled", async () => {
      const { user } = renderList({ "GET /api/documents": () => ({ documents: DRAFTS.slice(0, 2) }) });
      await screen.findAllByRole("listitem");
      await user.click(screen.getByRole("button", { name: "Delete Pilot Agreement" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(rows()).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Delete Pilot Agreement" })).toHaveFocus();
    });

    it("keeps the document and explains when deleting fails", async () => {
      const { user } = renderList({
        "GET /api/documents": () => ({ documents: DRAFTS.slice(0, 2) }),
        "DELETE /api/documents/b": () => new Response("down", { status: 502 }),
      });
      await screen.findAllByRole("listitem");
      await user.click(screen.getByRole("button", { name: "Delete Pilot Agreement" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete this document. Please try again.");
      expect(rows()).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Delete Pilot Agreement" })).toHaveFocus();
    });
  });

  describe("recent variant (dashboard)", () => {
    it("shows the latest three with a link to the rest, and no delete", async () => {
      renderList({ "GET /api/documents": () => ({ documents: DRAFTS }) }, "recent");
      expect(await screen.findByRole("heading", { name: "Recent documents" })).toBeInTheDocument();
      expect(rows()).toHaveLength(3);
      expect(screen.getByRole("link", { name: "View all 4" })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/app\/documents\/?$/),
      );
      expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
    });

    it("shows nothing until loaded, nor when there are no documents or it fails", async () => {
      for (const response of [() => ({ documents: [] }), () => new Response("down", { status: 502 })]) {
        const { container, requests, unmount } = renderList({ "GET /api/documents": response }, "recent");
        expect(container).toBeEmptyDOMElement();
        await waitFor(() => expect(requests).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(container).toBeEmptyDOMElement();
        unmount();
      }
    });
  });
});
