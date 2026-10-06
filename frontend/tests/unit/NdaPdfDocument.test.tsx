// @vitest-environment node
import { inflateSync } from "node:zlib";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, describe, expect, it } from "vitest";
import NdaPdfDocument from "@/components/NdaPdfDocument";
import { defaultNdaData, documentTexts, mapUserTexts, type NdaData } from "@/lib/nda";
import { loadNdaTemplate, type NdaTemplate } from "@/lib/nda-template";
import { planFonts } from "@/lib/pdf-fonts";
import { toPdfText } from "@/lib/pdf-fonts/chars";
import { loadPdfFonts } from "@/lib/pdf-fonts/load";
import { filledNdaData, TEMPLATES_DIR } from "../fixtures";

// These tests render real PDFs with the real Noto font pieces, fetched from
// jsDelivr and checked against the manifest's SRI hashes (network required).

let template: NdaTemplate;
beforeAll(async () => {
  template = await loadNdaTemplate(TEMPLATES_DIR);
});

/**
 * Renders the real PDF, preparing text and loading fonts exactly as the app
 * does (pass `raw` to skip the text clean-up), and returns its bytes,
 * per-page text, metadata and embedded fonts.
 */
async function renderPdf(formData: NdaData, { raw = false } = {}) {
  const data = raw ? formData : mapUserTexts(formData, toPdfText);
  const plan = planFonts(documentTexts(data, template));
  const fonts = await loadPdfFonts(plan.fonts);
  const buffer = await renderToBuffer(
    <NdaPdfDocument data={data} template={template} fonts={fonts} />,
  );
  const pdfDoc = await getDocumentProxy(new Uint8Array(buffer));
  const { text: pages } = await extractText(pdfDoc, { mergePages: false });
  const { info } = await pdfDoc.getMetadata();
  const all = pages.join("\n");
  // Font names embedded in the PDF (e.g. "/BaseFont /ABCDEF+NotoSerif-Regular").
  const embeddedFonts = [
    ...new Set([...buffer.toString("latin1").matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([\w-]+)/g)].map((m) => m[1])),
  ];
  // Collapse whitespace so assertions don't depend on line wrapping.
  return {
    buffer,
    pages,
    flat: all.replace(/\s+/g, " "),
    info: info as Record<string, string>,
    plan,
    embeddedFonts,
  };
}

/** The decompressed contents of every Flate-encoded stream in the PDF. */
function streams(buffer: Buffer): string[] {
  const contents: string[] = [];
  const latin1 = buffer.toString("latin1");
  for (const match of latin1.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = latin1.indexOf("endstream", start);
    try {
      contents.push(inflateSync(buffer.subarray(start, end)).toString("latin1"));
    } catch {
      // not a Flate stream (e.g. an image)
    }
  }
  return contents;
}

/** The text each embedded glyph stands for, from the PDF's ToUnicode maps. */
function glyphTexts(buffer: Buffer): Set<string> {
  const found = new Set<string>();
  for (const content of streams(buffer)) {
    if (!content.includes("begincmap")) continue;
    // bfrange destinations: [<0041> <0066 0069> ...], one per glyph; a
    // destination may hold several UTF-16 units (e.g. "fi" for a ligature).
    for (const [, list] of content.matchAll(/\[([^\]]*)\]/g)) {
      for (const [, hex] of list.matchAll(/<([0-9a-fA-F\s]+)>/g)) {
        const units = hex.replace(/\s/g, "").match(/.{4}/g)!.map((h) => parseInt(h, 16));
        found.add(String.fromCharCode(...units));
      }
    }
  }
  return found;
}

/**
 * Glyphs that stand for more than one character (ligatures like "fi"). PDF
 * readers differ in how they turn these back into text, so a legal document
 * should have none.
 */
const multiCharGlyphs = (buffer: Buffer) =>
  [...glyphTexts(buffer)].filter((text) => [...text].length > 1);


describe("NdaPdfDocument", () => {
  let filled: Awaited<ReturnType<typeof renderPdf>>;
  beforeAll(async () => {
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
    for (const section of template.standardTerms) {
      const body = section.body.map((p) => p.text).join("");
      expect(filled.flat).toContain(`${section.number}. ${section.title}. ${body}`.replace(/\s+/g, " "));
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
    const blank = await renderPdf(defaultNdaData());
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

});

describe("NdaPdfDocument fonts", () => {
  it("sets Latin-only documents entirely in Noto Serif (latin piece only)", async () => {
    const result = await renderPdf(filledNdaData());
    expect(result.plan.fonts.map((f) => f.family)).toEqual(["noto-serif-latin"]);
    expect(result.embeddedFonts.length).toBeGreaterThan(0);
    for (const font of result.embeddedFonts) expect(font).toMatch(/^NotoSerif-/);
    // Regular, bold and italic faces are all used by the template.
    expect(result.embeddedFonts).toEqual(
      expect.arrayContaining(["NotoSerif-Regular", "NotoSerif-Bold", "NotoSerif-Italic"]),
    );
  }, 60_000);

  it("uses no ligatures, so copy/paste and search work in every PDF reader", async () => {
    const result = await renderPdf(filledNdaData());
    // "Confidential", "Effective", "conflict" would otherwise use fi/ff/fl glyphs.
    expect(multiCharGlyphs(result.buffer)).toEqual([]);
  }, 60_000);

  describe("tabs and invisible characters", () => {
    const tricky = () =>
      filledNdaData({
        purpose: "Joint\tventure‍ for ™️ products‏.",
        jurisdiction: "東京︀ District",
      });

    it("react-pdf would otherwise drop tabs, running words together", async () => {
      const raw = await renderPdf(tricky(), { raw: true });
      expect(raw.flat).toContain("Jointventure");
    }, 60_000);

    it("keeps words apart and draws invisible characters as nothing", async () => {
      const result = await renderPdf(tricky());
      // (The RLM before "." starts a new bidi run, which pdf.js's text
      // extraction separates with a space; it isn't visible in the PDF.)
      expect(result.flat).toContain("Joint venture for ™ products");
      expect(result.flat).toContain("東京 District");
    }, 60_000);
  });

  // Each script in a different field, as users would type them.
  const multilingual = () => {
    const data = filledNdaData({
      purpose: "Сотрудничество в области исследований — Έρευνα και ανάπτυξη.",
      governingLaw: "Delaware",
      jurisdiction: "Thành phố Hồ Chí Minh",
      modifications: "Zażółć gęślą jaźń; Dvořák; Ağaoğlu; Őrség.",
    });
    data.parties[0] = {
      printName: "山田 太郎",
      title: "代表取締役",
      company: "株式会社さくら",
      noticeAddress: "東京都千代田区1-1",
    };
    data.parties[1] = {
      printName: "김민준",
      title: "대표이사",
      company: "李明 有限公司",
      noticeAddress: "서울특별시 중구",
    };
    return data;
  };

  let result: Awaited<ReturnType<typeof renderPdf>>;
  beforeAll(async () => {
    result = await renderPdf(multilingual());
  }, 120_000);

  it.each([
    ["Cyrillic", "Сотрудничество в области исследований"],
    ["Greek", "Έρευνα και ανάπτυξη"],
    ["Vietnamese", "Thành phố Hồ Chí Minh"],
    ["Central European", "Zażółć gęślą jaźń; Dvořák; Ağaoğlu; Őrség."],
    ["Japanese (kanji + kana)", "株式会社さくら"],
    ["Japanese name", "山田 太郎"],
    ["Japanese title", "代表取締役"],
    ["Korean", "김민준"],
    ["Korean title", "대표이사"],
    ["Chinese", "李明 有限公司"],
  ])("draws %s text", (_script, text) => {
    expect(result.flat).toContain(text);
  });

  it("leaves no characters unsupported", () => {
    expect(result.plan.unsupported).toEqual([]);
  });

  it("loads only the font pieces the text needs", () => {
    const families = result.plan.fonts.map((f) => f.family);
    expect(families).toEqual(
      expect.arrayContaining([
        "noto-serif-latin",
        "noto-serif-latin-ext",
        "noto-serif-cyrillic",
        "noto-serif-greek",
        "noto-serif-vietnamese",
      ]),
    );
    // Kana present, so Japanese is preferred for the shared Han characters.
    expect(families.some((f) => f.startsWith("noto-sans-jp-"))).toBe(true);
    expect(families.some((f) => f.startsWith("noto-sans-kr-"))).toBe(true);
    // A handful of CJK pieces, not the ~100 each font is split into.
    expect(families.filter((f) => f.startsWith("noto-sans-")).length).toBeLessThan(25);
  });

  it("embeds the CJK fonts it used", () => {
    expect(result.embeddedFonts).toEqual(
      expect.arrayContaining([expect.stringMatching(/^NotoSansJP-/), expect.stringMatching(/^NotoSansKR-/)]),
    );
  });

  it("still fits the cover page on page 1", () => {
    expect(result.pages[0]).toContain("PARTY 2");
    expect(result.pages[1].trimStart()).toMatch(/^Standard Terms/);
  });
});
