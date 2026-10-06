import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadNdaTemplate,
  parseCoverPage,
  parseInline,
  parseStandardTerms,
  TemplateParseError,
  type Inline,
} from "@/lib/nda-template";
import { TEMPLATES_DIR } from "../fixtures";

const read = (file: string) => readFileSync(path.join(TEMPLATES_DIR, file), "utf8");

/** Plain text of parsed inline content. */
const plain = (content: Inline[]) => content.map((p) => p.text).join("");

/**
 * Independently strips the template markup (bold, links, cover-page spans) so
 * parser output can be compared word-for-word against the source.
 */
const stripMarkup = (markdown: string) =>
  markdown
    .replace(/\*\*/g, "")
    .replace(/<span class="coverpage_link">([^<]*)<\/span>/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

const COVER = "## USING THIS MUTUAL NON-DISCLOSURE AGREEMENT";
const ATTRIBUTION =
  "Common Paper Mutual Non-Disclosure Agreement free to use under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).";

describe("parseInline", () => {
  it("returns plain text unchanged", () => {
    expect(parseInline("Just text.")).toEqual([{ kind: "text", text: "Just text." }]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("parses bold, links and cover-page term references in order", () => {
    expect(
      parseInline(
        'A **bold** word, a [link](https://example.com) and the <span class="coverpage_link">Purpose</span>.',
      ),
    ).toEqual([
      { kind: "text", text: "A " },
      { kind: "bold", text: "bold" },
      { kind: "text", text: " word, a " },
      { kind: "link", text: "link", href: "https://example.com" },
      { kind: "text", text: " and the " },
      { kind: "term", text: "Purpose" },
      { kind: "text", text: "." },
    ]);
  });

  it("handles adjacent markup with no text between", () => {
    expect(parseInline("**a****b**")).toEqual([
      { kind: "bold", text: "a" },
      { kind: "bold", text: "b" },
    ]);
  });

  it("handles markup at the very start and end", () => {
    expect(parseInline('<span class="coverpage_link">Jurisdiction</span>')).toEqual([
      { kind: "term", text: "Jurisdiction" },
    ]);
  });

  it("preserves curly quotes around bold terms", () => {
    expect(parseInline("(“**MNDA**”)")).toEqual([
      { kind: "text", text: "(“" },
      { kind: "bold", text: "MNDA" },
      { kind: "text", text: "”)" },
    ]);
  });

  it("leaves unmatched markup as literal text", () => {
    expect(plain(parseInline("an **unclosed bold"))).toBe("an **unclosed bold");
  });
});

describe("parseStandardTerms (real template)", () => {
  const source = read("Mutual-NDA.md");
  const { standardTerms, standardTermsAttribution } = parseStandardTerms(source);

  it("finds all 11 numbered sections in order", () => {
    expect(standardTerms.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(standardTerms.map((s) => s.title)).toEqual([
      "Introduction",
      "Use and Protection of Confidential Information",
      "Exceptions",
      "Disclosures Required by Law",
      "Term and Termination",
      "Return or Destruction of Confidential Information",
      "Proprietary Rights",
      "Disclaimer",
      "Governing Law and Jurisdiction",
      "Equitable Relief",
      "General",
    ]);
  });

  it("reproduces every section's text word-for-word", () => {
    const sourceSections = source
      .split(/\r?\n/)
      .filter((l) => /^\d+\.\s/.test(l.trim()))
      .map((l) => stripMarkup(l.trim()));
    expect(sourceSections).toHaveLength(standardTerms.length);
    standardTerms.forEach((section, i) => {
      expect(`${section.number}. ${section.title}. ${plain(section.body)}`).toBe(
        sourceSections[i],
      );
    });
  });

  it("marks cover-page references as terms", () => {
    const terms = (n: number) =>
      standardTerms[n - 1].body.filter((p) => p.kind === "term").map((p) => p.text);
    expect(terms(1)).toEqual(["Purpose"]);
    expect(terms(2)).toEqual(["Purpose", "Purpose"]);
    expect(terms(5)).toEqual(["Effective Date", "MNDA Term", "Term of Confidentiality"]);
    expect(terms(9)).toEqual(["Governing Law", "Governing Law", "Jurisdiction", "Jurisdiction"]);
  });

  it("keeps defined terms in bold", () => {
    const bold = standardTerms[0].body.filter((p) => p.kind === "bold").map((p) => p.text);
    expect(bold).toEqual([
      "MNDA",
      "Disclosing Party",
      "Receiving Party",
      "Confidential Information",
      "Cover Page",
    ]);
  });

  it("contains no leftover markup", () => {
    for (const section of standardTerms) {
      expect(plain(section.body)).not.toMatch(/\*\*|<span|<\/span>|\]\(/);
    }
  });

  it("parses the CC BY 4.0 attribution with its links", () => {
    expect(plain(standardTermsAttribution)).toBe(
      "Common Paper Mutual Non-Disclosure Agreement Version 1.0 free to use under CC BY 4.0.",
    );
    expect(standardTermsAttribution.filter((p) => p.kind === "link")).toEqual([
      {
        kind: "link",
        text: "Version 1.0",
        href: "https://commonpaper.com/standards/mutual-nda/1.0/",
      },
      { kind: "link", text: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
    ]);
  });
});

describe("parseCoverPage (real template)", () => {
  const { coverIntro, coverAttribution } = parseCoverPage(read("Mutual-NDA-coverpage.md"));

  it("extracts the 'Using this MNDA' introduction", () => {
    expect(plain(coverIntro)).toMatch(
      /^This Mutual Non-Disclosure Agreement \(the “MNDA”\) consists of:/,
    );
    expect(plain(coverIntro)).toMatch(/will control over conflicts with the Standard Terms\.$/);
    expect(coverIntro.filter((p) => p.kind === "bold").map((p) => p.text)).toEqual([
      "Cover Page",
      "Standard Terms",
    ]);
  });

  it("keeps the standard terms link with an absolute https URL", () => {
    const [link] = coverIntro.filter((p) => p.kind === "link");
    expect(link).toEqual({
      kind: "link",
      text: "commonpaper.com/standards/mutual-nda/1.0",
      href: "https://commonpaper.com/standards/mutual-nda/1.0",
    });
  });

  it("extracts the CC BY 4.0 attribution", () => {
    expect(plain(coverAttribution)).toBe(
      "Common Paper Mutual Non-Disclosure Agreement (Version 1.0) free to use under CC BY 4.0.",
    );
  });
});

describe("template structure validation", () => {
  const terms = (...sections: string[]) =>
    ["# Standard Terms", "", ...sections, "", ATTRIBUTION].join("\n");

  it("accepts Windows (CRLF) line endings", () => {
    const parsed = parseStandardTerms(terms("1. **One**. First.", "2. **Two**. Second.").replace(/\n/g, "\r\n"));
    expect(parsed.standardTerms.map((s) => s.title)).toEqual(["One", "Two"]);
    expect(plain(parsed.standardTerms[1].body)).toBe("Second.");
  });

  it("rejects standard terms without the CC BY attribution", () => {
    expect(() => parseStandardTerms("# Standard Terms\n\n1. **One**. First.")).toThrow(
      TemplateParseError,
    );
    expect(() => parseStandardTerms("# Standard Terms\n\n1. **One**. First.")).toThrow(
      /attribution/,
    );
  });

  it("rejects a line that is not a numbered section (e.g. a wrapped paragraph)", () => {
    expect(() =>
      parseStandardTerms(terms("1. **One**. First half of a section", "that wrapped onto a new line.")),
    ).toThrow(/unrecognized line: "that wrapped/);
  });

  it("rejects standard terms with no sections", () => {
    expect(() => parseStandardTerms(terms())).toThrow(/no numbered sections/);
  });

  it("rejects a cover page without the 'Using this' heading", () => {
    expect(() => parseCoverPage(`# Mutual NDA\n\nIntro\n\n${ATTRIBUTION}`)).toThrow(
      /"Using this" introduction/,
    );
  });

  it("rejects a cover page whose 'Using this' heading has no paragraph", () => {
    expect(() => parseCoverPage(`${COVER}\n\n### Purpose\n\n${ATTRIBUTION}`)).toThrow(
      /"Using this" introduction/,
    );
  });

  it("rejects a cover page without the CC BY attribution", () => {
    expect(() => parseCoverPage(`${COVER}\n\nIntro paragraph.`)).toThrow(/attribution/);
  });

  it("names the offending file in errors", () => {
    expect(() => parseCoverPage("", "custom.md")).toThrow(/custom\.md/);
  });
});

describe("loadNdaTemplate", () => {
  it("loads and parses the repo templates", async () => {
    const template = await loadNdaTemplate(TEMPLATES_DIR);
    expect(template.standardTerms).toHaveLength(11);
    expect(plain(template.coverIntro)).toContain("Common Paper Mutual NDA Standard Terms");
    expect(plain(template.coverAttribution)).toContain("CC BY 4.0");
    expect(plain(template.standardTermsAttribution)).toContain("CC BY 4.0");
  });

  it("produces JSON-serializable data (it crosses the server/client boundary)", async () => {
    const template = await loadNdaTemplate(TEMPLATES_DIR);
    expect(JSON.parse(JSON.stringify(template))).toEqual(template);
  });

  it("fails clearly when the templates directory is missing", async () => {
    await expect(loadNdaTemplate(path.join(TEMPLATES_DIR, "does-not-exist"))).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("fails the load when a template is malformed", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nda-template-"));
    writeFileSync(path.join(dir, "Mutual-NDA-coverpage.md"), read("Mutual-NDA-coverpage.md"));
    writeFileSync(path.join(dir, "Mutual-NDA.md"), "# Standard Terms\n\n1. **One**. Text.\n");
    await expect(loadNdaTemplate(dir)).rejects.toThrow(TemplateParseError);
  });
});
