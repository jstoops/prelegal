// @vitest-environment node
import { renderToBuffer } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, describe, expect, it } from "vitest";
import DocumentPdf from "@/components/DocumentPdf";
import type { CreatorDocument } from "@/lib/catalog";
import { defaultDocumentData, DRAFT_DISCLAIMER, withDefaultDates, type DocumentData } from "@/lib/document";
import type { Clause, Inline } from "@/lib/template";
import { creatorDocuments, filledNdaData } from "../fixtures";

let documents: CreatorDocument[];
const doc = (id: string) => documents.find((d) => d.definition.id === id)!;

const plain = (content: Inline[]) => content.map((p) => p.text).join("");
const flatten = (clauses: Clause[]): Clause[] => clauses.flatMap((c) => [c, ...flatten(c.children)]);

/** Renders the real PDF and returns its bytes, per-page text and metadata. */
async function renderPdf(data: DocumentData) {
  const buffer = await renderToBuffer(<DocumentPdf document={doc(data.documentId!)} data={data} />);
  const pdfDoc = await getDocumentProxy(new Uint8Array(buffer));
  const { text: pages } = await extractText(pdfDoc, { mergePages: false });
  const { info } = await pdfDoc.getMetadata();
  const all = pages.join("\n");
  // Collapse whitespace so assertions don't depend on line wrapping.
  return { buffer, pages, flat: all.replace(/\s+/g, " "), info: info as Record<string, string> };
}

describe("DocumentPdf", () => {
  let filled: Awaited<ReturnType<typeof renderPdf>>;
  beforeAll(async () => {
    documents = await creatorDocuments();
    filled = await renderPdf(filledNdaData());
  }, 30_000);

  it("produces a valid PDF with document metadata", () => {
    expect(filled.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(filled.info.Title).toBe("Mutual Non-Disclosure Agreement");
    expect(filled.info.Creator).toBe("Prelegal");
  });

  it("fits the whole cover page, including the signature table, on page 1", () => {
    const [cover] = filled.pages;
    for (const text of [
      "Mutual Non-Disclosure Agreement",
      "Purpose",
      "MNDA Modifications",
      "By signing this Cover Page",
      "PARTY 1",
      "PARTY 2",
      "Signature",
      "Notice Address",
      "Date",
    ]) {
      expect(cover).toContain(text);
    }
    expect(cover).not.toContain("Standard Terms\n1.");
  });

  it("marks every page as a draft subject to legal review", async () => {
    const long = await renderPdf(filledNdaData({ purpose: "word ".repeat(1500) }));
    expect(long.pages.length).toBeGreaterThan(2);
    for (const page of long.pages) {
      expect(page.replace(/\s+/g, " ")).toContain(DRAFT_DISCLAIMER);
    }
  });

  it("starts the Standard Terms on a new page", () => {
    expect(filled.pages[1].trimStart()).toMatch(/^Standard Terms/);
  });

  it("includes every filled-in value", () => {
    for (const text of [
      "Exploring a joint go-to-market partnership.",
      "October 5, 2026",
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
      "Section 6 retention period is limited to 90 days.",
      "Jane Doe",
      "John Roe",
      "CEO",
      "CTO",
      "Acme, Inc.",
      "Globex LLC",
      "legal@acme.com",
      "1 Main St, Springfield, IL",
    ]) {
      expect(filled.flat).toContain(text);
    }
  });

  it("marks only the selected options", async () => {
    expect(filled.flat).toMatch(/X Expires 2 years from Effective Date\./);
    expect(filled.flat).not.toMatch(/X Continues until terminated/);
    expect(filled.flat).toMatch(/X 3 years from Effective Date/);

    const open = await renderPdf(filledNdaData({ mndaTermType: "open", confidentialityType: "open" }));
    expect(open.flat).toMatch(/X Continues until terminated/);
    expect(open.flat).toMatch(/X In perpetuity\./);
    expect(open.flat).not.toMatch(/X Expires/);
  }, 30_000);

  it("includes all 11 standard terms word-for-word", () => {
    for (const clause of doc("mutual-nda").terms.clauses) {
      expect(filled.flat).toContain(`${clause.label} ${plain(clause.body)}`.replace(/\s+/g, " "));
    }
  });

  it("includes both CC BY 4.0 attributions", () => {
    expect(filled.flat).toContain(
      "Common Paper Mutual Non-Disclosure Agreement (Version 1.0) free to use under CC BY 4.0.",
    );
    expect(filled.flat).toContain(
      "Common Paper Mutual Non-Disclosure Agreement Version 1.0 free to use under CC BY 4.0.",
    );
  });

  it("never hyphenates words across lines", () => {
    // A hyphen at the end of a line followed by a lowercase continuation.
    for (const page of filled.pages) {
      expect(page).not.toMatch(/[A-Za-z]-\n[a-z]/);
      expect(page).not.toMatch(/[A-Z]-\n[A-Z]/);
    }
  });

  it("shows placeholders for blank fields", async () => {
    const blank = await renderPdf(defaultDocumentData(doc("mutual-nda").definition));
    expect(blank.flat).toContain("[Effective Date]");
    expect(blank.flat).toContain("Governing Law: [Governing Law]");
    expect(blank.flat).toContain("Jurisdiction: [Jurisdiction]");
    expect(blank.flat).toContain("None.");
  }, 30_000);

  it("renders special characters from user input literally", async () => {
    const data = filledNdaData({ purpose: 'R&D on "Widgets" <beta> — 50% off & more' });
    const result = await renderPdf(data);
    expect(result.flat).toContain('R&D on "Widgets" <beta> — 50% off & more');
  }, 30_000);

  it("never clips very long text: it flows onto extra pages", async () => {
    const words = Array.from({ length: 1500 }, (_, i) => `word${i}`).join(" ");
    const long = await renderPdf(filledNdaData({ purpose: `${words} THE-END-OF-PURPOSE` }));
    expect(long.pages.length).toBeGreaterThan(filled.pages.length);
    expect(long.flat).toContain("word0 word1 word2");
    expect(long.flat).toContain("word1499 THE-END-OF-PURPOSE");
    // The rest of the document still follows.
    expect(long.flat).toContain("By signing this Cover Page");
    expect(long.flat).toContain("11. General.");
  }, 30_000);

  it("never splits the signature table across pages", async () => {
    const words = Array.from({ length: 450 }, (_, i) => `w${i}`).join(" ");
    const result = await renderPdf(filledNdaData({ modifications: words }));
    const tablePages = result.pages
      .map((page, i) => (page.includes("PARTY 1") || page.includes("Notice Address") ? i : -1))
      .filter((i) => i >= 0);
    expect(new Set(tablePages).size).toBe(1);
  }, 30_000);

  it("renders every document with its parties and every clause", async () => {
    for (const { definition, terms } of documents) {
      const data = withDefaultDates(definition, defaultDocumentData(definition), "2026-10-05");
      const result = await renderPdf(data);
      expect(result.info.Title).toBe(definition.name);
      expect(result.flat).toContain(definition.parties[0].toUpperCase());
      expect(result.flat).toContain(definition.signingStatement);
      for (const clause of flatten(terms.clauses)) {
        const start = `${clause.label} ${clause.heading ?? plain(clause.body).slice(0, 30)}`;
        expect(result.flat, `${definition.id} ${clause.label}`).toContain(start.replace(/\s+/g, " ").trim());
      }
    }
  }, 120_000);

  it.todo("renders non-Latin scripts (CJK, Cyrillic, Greek) — needs an embedded Unicode font");
});
