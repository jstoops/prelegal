import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteFooter from "@/components/SiteFooter";
import { DRAFT_DISCLAIMER } from "@/lib/document";

describe("SiteFooter", () => {
  it("says documents are drafts subject to legal review", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(DRAFT_DISCLAIMER);
    expect(footer).toHaveTextContent(/subject to legal review/);
  });

  it("credits Common Paper's CC BY 4.0 templates", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Common Paper" })).toHaveAttribute("href", "https://commonpaper.com");
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });
});
