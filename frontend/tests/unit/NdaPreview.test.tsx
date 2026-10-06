import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import NdaPreview from "@/components/NdaPreview";
import { defaultNdaData, type NdaData } from "@/lib/nda";
import { loadNdaTemplate, type NdaTemplate } from "@/lib/nda-template";
import { filledNdaData, TEMPLATES_DIR } from "../fixtures";

let template: NdaTemplate;
beforeAll(async () => {
  template = await loadNdaTemplate(TEMPLATES_DIR);
});

const renderPreview = (data: NdaData = filledNdaData()) =>
  render(<NdaPreview data={data} template={template} />);

/** The cover-page section whose heading is `heading`. */
const coverSection = (heading: string) =>
  within(screen.getByRole("heading", { level: 3, name: heading }).closest("section")!);

const tableRow = (label: RegExp) =>
  screen.getByRole("rowheader", { name: label }).closest("tr")!;

describe("NdaPreview", () => {
  describe("structure", () => {
    it("titles the document without competing with the page's h1", () => {
      renderPreview();
      expect(
        screen.getByRole("heading", { level: 2, name: "Mutual Non-Disclosure Agreement" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    });

    it("renders the cover page sections as headings", () => {
      renderPreview();
      for (const heading of [
        "Purpose",
        "Effective Date",
        "MNDA Term",
        "Term of Confidentiality",
        "Governing Law & Jurisdiction",
        "MNDA Modifications",
        "Standard Terms",
      ]) {
        expect(screen.getByRole("heading", { level: 3, name: heading })).toBeInTheDocument();
      }
    });

    it("includes the cover page intro with its link", () => {
      renderPreview();
      expect(screen.getByText(/consists of: \(1\) this Cover Page/)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "commonpaper.com/standards/mutual-nda/1.0" });
      expect(link).toHaveAttribute("href", "https://commonpaper.com/standards/mutual-nda/1.0");
    });

    it("opens external links safely in a new tab", () => {
      renderPreview();
      for (const link of screen.getAllByRole("link")) {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noreferrer");
        expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      }
    });

    it("renders all 11 standard terms in order", () => {
      const { container } = renderPreview();
      const items = within(container.querySelector("ol")!).getAllByRole("listitem");
      expect(items).toHaveLength(11);
      expect(items[0]).toHaveTextContent(/^1\. Introduction\. This Mutual Non-Disclosure/);
      expect(items[10]).toHaveTextContent(/^11\. General\. Neither party/);
    });

    it("shows both CC BY 4.0 attributions", () => {
      renderPreview();
      expect(screen.getAllByRole("link", { name: "CC BY 4.0" })).toHaveLength(2);
    });
  });

  describe("filled-in values", () => {
    it("shows the purpose, date, law and jurisdiction", () => {
      renderPreview();
      expect(coverSection("Purpose").getByText("Exploring a joint go-to-market partnership.")).toBeInTheDocument();
      expect(coverSection("Effective Date").getByText("October 5, 2026")).toBeInTheDocument();
      expect(coverSection("Governing Law & Jurisdiction").getByText("Governing Law: Delaware")).toBeInTheDocument();
      expect(coverSection("Governing Law & Jurisdiction").getByText("Jurisdiction: New Castle, DE")).toBeInTheDocument();
    });

    it("preserves line breaks in multi-line text", () => {
      renderPreview(filledNdaData({ modifications: "First change.\nSecond change." }));
      const text = coverSection("MNDA Modifications").getByText(/First change\./);
      expect(text).toHaveClass("whitespace-pre-wrap");
      expect(text.textContent).toBe("First change.\nSecond change.");
    });

    it("marks only the selected MNDA term and confidentiality options", () => {
      renderPreview(filledNdaData({ mndaTermType: "open", confidentialityType: "fixed" }));
      const term = coverSection("MNDA Term").getAllByRole("listitem");
      expect(term[0]).toHaveTextContent("☐Expires 2 years from Effective Date.");
      expect(term[1]).toHaveTextContent("☒Continues until terminated");
      const conf = coverSection("Term of Confidentiality").getAllByRole("listitem");
      expect(conf[0]).toHaveTextContent(/^☒3 years from Effective Date/);
      expect(conf[1]).toHaveTextContent("☐In perpetuity.");
    });

    it("fills the party table", () => {
      renderPreview();
      expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "PARTY 1",
        "PARTY 2",
      ]);
      const cells = (label: RegExp) =>
        within(tableRow(label)).getAllByRole("cell").map((c) => c.textContent);
      expect(cells(/^Print Name/)).toEqual(["Jane Doe", "John Roe"]);
      expect(cells(/^Title/)).toEqual(["CEO", "CTO"]);
      expect(cells(/^Company/)).toEqual(["Acme, Inc.", "Globex LLC"]);
      expect(cells(/^Notice Address/)).toEqual(["legal@acme.com", "1 Main St, Springfield, IL"]);
      expect(cells(/^Signature/)).toEqual(["", ""]);
      expect(cells(/^Date/)).toEqual(["", ""]);
    });

    it("leaves extra room in the signature row", () => {
      renderPreview();
      for (const cell of within(tableRow(/^Signature/)).getAllByRole("cell")) {
        expect(cell).toHaveClass("h-16");
      }
    });

    it("renders user input as text, never as HTML", () => {
      const data = filledNdaData({ purpose: '<img src=x onerror="alert(1)"><script>alert(2)</script>' });
      data.parties[0].company = "<b>Bold Co</b>";
      const { container } = renderPreview(data);
      expect(container.querySelector("img, script, b")).toBeNull();
      expect(screen.getByText(/<script>alert\(2\)<\/script>/)).toBeInTheDocument();
      expect(screen.getByText("<b>Bold Co</b>")).toBeInTheDocument();
    });
  });

  describe("blank form", () => {
    it("shows bracketed placeholders for missing terms", () => {
      renderPreview(defaultNdaData());
      expect(coverSection("Effective Date").getByText("[Effective Date]")).toBeInTheDocument();
      expect(coverSection("Governing Law & Jurisdiction").getByText("Governing Law: [Governing Law]")).toBeInTheDocument();
      expect(coverSection("Governing Law & Jurisdiction").getByText("Jurisdiction: [Jurisdiction]")).toBeInTheDocument();
      expect(coverSection("MNDA Modifications").getByText("None.")).toBeInTheDocument();
    });

    it("still renders the default purpose and 1-year terms", () => {
      renderPreview(defaultNdaData());
      expect(coverSection("Purpose").getByText(/Evaluating whether to enter/)).toBeInTheDocument();
      expect(coverSection("MNDA Term").getByText("Expires 1 year from Effective Date.")).toBeInTheDocument();
    });
  });
});
