import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocumentList from "@/components/DocumentList";

const documents = [
  { name: "Mutual Non-Disclosure Agreement", description: "Share secrets.", href: "/app/nda/" },
  { name: "Pilot Agreement", description: "Try before you buy." },
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

  it("links available documents to their creator", () => {
    render(<DocumentList documents={documents} />);
    expect(
      screen.getByRole("link", { name: "Create Mutual Non-Disclosure Agreement" }),
    ).toHaveAttribute("href", expect.stringMatching(/^\/app\/nda\/?$/)); // see AppHeader.test
  });

  it("marks the others as coming soon, without a link", () => {
    render(<DocumentList documents={documents} />);
    const pilot = within(screen.getAllByRole("listitem")[1]);
    expect(pilot.getByText("Coming soon")).toBeInTheDocument();
    expect(pilot.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
