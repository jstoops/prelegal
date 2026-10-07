import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocumentList from "@/components/DocumentList";

const documents = [
  { id: "mutual-nda", name: "Mutual Non-Disclosure Agreement", description: "Share secrets." },
  { id: "pilot-agreement", name: "Pilot Agreement", description: "Try before you buy." },
];

describe("DocumentList", () => {
  it("lists every document with its description", () => {
    render(<DocumentList documents={documents} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Mutual Non-Disclosure Agreement",
    );
    expect(within(items[1]).getByText("Try before you buy.")).toBeInTheDocument();
  });

  it("links every document to the creator with it preselected", () => {
    render(<DocumentList documents={documents} />);
    expect(screen.getByRole("link", { name: "Create Mutual Non-Disclosure Agreement" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/create\/?\?doc=mutual-nda$/), // see AppHeader.test
    );
    expect(screen.getByRole("link", { name: "Create Pilot Agreement" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/create\/?\?doc=pilot-agreement$/),
    );
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
});
