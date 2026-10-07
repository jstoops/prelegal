import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadStandardTerms,
  parseInline,
  parseStandardTerms,
  TemplateParseError,
  type Clause,
  type Inline,
} from "@/lib/template";
import { DOCUMENTS, REPO_ROOT, TEMPLATES_DIR } from "../fixtures";

const read = (file: string) => readFileSync(path.join(TEMPLATES_DIR, file), "utf8");

/** Plain text of parsed inline content. */
const plain = (content: Inline[]) => content.map((p) => p.text).join("");

/** Every clause, depth first. */
const flatten = (clauses: Clause[]): Clause[] => clauses.flatMap((c) => [c, ...flatten(c.children)]);

/**
 * Independently strips the template markup (bold, links, spans) so parser
 * output can be compared word-for-word against the source.
 */
const stripMarkup = (markdown: string) =>
  markdown
    .replace(/\*\*/g, "")
    .replace(/<span[^>]*>([^<]*)<\/span>/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<(https?:[^>]*)>/g, "$1");

const ATTRIBUTION =
  "Common Paper Mutual Non-Disclosure Agreement free to use under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).";

describe("parseInline", () => {
  it("returns plain text unchanged", () => {
    expect(parseInline("Just text.")).toEqual([{ kind: "text", text: "Just text." }]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("parses bold, links and term references in order", () => {
    expect(
      parseInline(
        'A **bold** word, a [link](https://example.com) and the <span class="coverpage_link">Purpose</span>.',
      ),
    ).toEqual([
      { kind: "text", text: "A " },
      { kind: "text", text: "bold", bold: true },
      { kind: "text", text: " word, a " },
      { kind: "link", text: "link", href: "https://example.com" },
      { kind: "text", text: " and the " },
      { kind: "term", text: "Purpose" },
      { kind: "text", text: "." },
    ]);
  });

  it.each(["coverpage_link", "keyterms_link", "orderform_link", "sow_link", "businessterms_link"])(
    "treats %s spans as Cover Page terms",
    (cls) => {
      expect(parseInline(`<span class="${cls}">Fees</span>`)).toEqual([{ kind: "term", text: "Fees" }]);
    },
  );

  it("keeps terms and links inside bold text bold", () => {
    expect(
      parseInline('**Liability is capped at the <span class="keyterms_link">General Cap Amount</span>.**'),
    ).toEqual([
      { kind: "text", text: "Liability is capped at the ", bold: true },
      { kind: "term", text: "General Cap Amount", bold: true },
      { kind: "text", text: ".", bold: true },
    ]);
  });

  it("parses autolinks and adds a scheme to bare link targets", () => {
    expect(parseInline("See <https://commonpaper.com/x/>.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "https://commonpaper.com/x/", href: "https://commonpaper.com/x/" },
      { kind: "text", text: "." },
    ]);
    expect(parseInline("[here](commonpaper.com/y)")).toEqual([
      { kind: "link", text: "here", href: "https://commonpaper.com/y" },
    ]);
  });

  it("drops anchor spans but keeps their text", () => {
    expect(parseInline('<span id="4.6"></span>**"Output"** means')).toEqual([
      { kind: "text", text: '"Output"', bold: true },
      { kind: "text", text: " means" },
    ]);
    expect(parseInline('<span id="13.32">**"User"**</span> means')).toEqual([
      { kind: "text", text: '"User"', bold: true },
      { kind: "text", text: " means" },
    ]);
  });

  it("handles adjacent bold with no text between", () => {
    expect(parseInline("**a****b**")).toEqual([
      { kind: "text", text: "a", bold: true },
      { kind: "text", text: "b", bold: true },
    ]);
  });

  it("preserves curly quotes around bold terms", () => {
    expect(parseInline("(“**MNDA**”)")).toEqual([
      { kind: "text", text: "(“" },
      { kind: "text", text: "MNDA", bold: true },
      { kind: "text", text: "”)" },
    ]);
  });

  it("rejects unbalanced bold and unknown markup", () => {
    expect(() => parseInline("an **unclosed bold")).toThrow(/unbalanced \*\*/);
    expect(() => parseInline("an <em>emphasis</em>")).toThrow(/unrecognized markup/);
    expect(() => parseInline('<span class="mystery">X</span>')).toThrow(TemplateParseError);
    expect(() => parseInline("a [**bold** link](https://example.com)")).toThrow(/unrecognized markup/);
  });
});

describe("parseStandardTerms (Mutual NDA)", () => {
  const source = read("Mutual-NDA.md");
  const { clauses, attribution } = parseStandardTerms(source, "Mutual-NDA.md");

  it("finds all 11 numbered sections in order", () => {
    expect(clauses.map((c) => c.label)).toEqual(
      ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11."],
    );
    expect(clauses.every((c) => c.children.length === 0)).toBe(true);
  });

  it("reproduces every section's text word-for-word", () => {
    const sourceSections = source
      .split(/\r?\n/)
      .filter((l) => /^\d+\.\s/.test(l.trim()))
      .map((l) => stripMarkup(l.trim()));
    expect(clauses.map((c) => `${c.label} ${plain(c.body)}`)).toEqual(sourceSections);
  });

  it("marks cover-page references as terms", () => {
    const terms = (n: number) => clauses[n - 1].body.filter((p) => p.kind === "term").map((p) => p.text);
    expect(terms(1)).toEqual(["Purpose"]);
    expect(terms(5)).toEqual(["Effective Date", "MNDA Term", "Term of Confidentiality"]);
    expect(terms(9)).toEqual(["Governing Law", "Governing Law", "Jurisdiction", "Jurisdiction"]);
  });

  it("keeps section titles and defined terms in bold", () => {
    const bold = clauses[0].body.filter((p) => p.bold).map((p) => p.text);
    expect(bold).toEqual([
      "Introduction",
      "MNDA",
      "Disclosing Party",
      "Receiving Party",
      "Confidential Information",
      "Cover Page",
    ]);
  });

  it("parses the CC BY 4.0 attribution with its links", () => {
    expect(plain(attribution!)).toBe(
      "Common Paper Mutual Non-Disclosure Agreement Version 1.0 free to use under CC BY 4.0.",
    );
    expect(attribution!.filter((p) => p.kind === "link").map((p) => p.text)).toEqual([
      "Version 1.0",
      "CC BY 4.0",
    ]);
  });
});

describe("parseStandardTerms (nested templates)", () => {
  const source = read("CSA.md");
  const { clauses, attribution } = parseStandardTerms(source, "CSA.md");

  it("nests clauses and numbers them 1., 1.1 and (a)", () => {
    expect(clauses[0]).toMatchObject({ label: "1.", heading: "Service", body: [] });
    expect(clauses[0].children[0]).toMatchObject({ label: "1.1", heading: "Access and Use." });
    const restrictions = clauses[1].children[0];
    expect(restrictions.heading).toBe("Restrictions on Customer.");
    expect(restrictions.children.map((c) => c.label)).toEqual(["(a)", "(b)"]);
  });

  it("keeps every clause of the template, word-for-word", () => {
    const sourceLines = source
      .split(/\r?\n/)
      .filter((l) => /^\s*(\d+|[a-z]+)\.\s/.test(l))
      .map((l) => stripMarkup(l.trim().replace(/^(\d+|[a-z]+)\.\s+/, "")).replace(/\s+/g, " "));
    const parsed = flatten(clauses).map((c) =>
      `${c.heading ? `${c.heading} ` : ""}${plain(c.body)}`.replace(/\s+/g, " ").trim(),
    );
    expect(parsed).toEqual(sourceLines.map((l) => l.trim()));
  });

  it("has no attribution line of its own", () => {
    expect(attribution).toBeUndefined();
  });

  it("goes four levels deep (DPA's (i) clauses)", () => {
    const dpa = parseStandardTerms(read("DPA.md"), "DPA.md");
    const roman = flatten(dpa.clauses).filter((c) => c.label === "(iv)");
    expect(roman.length).toBeGreaterThan(0);
  });
});

describe("template structure validation", () => {
  const terms = (...lines: string[]) => ["# Standard Terms", "", ...lines, "", ATTRIBUTION].join("\n");

  it("accepts Windows (CRLF) line endings", () => {
    const parsed = parseStandardTerms(
      terms("1. **One**. First.", "    1. Nested.").replace(/\n/g, "\r\n"),
      "t.md",
    );
    expect(plain(parsed.clauses[0].children[0].body)).toBe("Nested.");
  });

  it("rejects a line that is not a numbered clause (e.g. a wrapped paragraph)", () => {
    expect(() =>
      parseStandardTerms(terms("1. **One**. First half of a section", "that wrapped onto a new line."), "t.md"),
    ).toThrow(/unrecognized line: "that wrapped/);
  });

  it("rejects a clause nested more than one level below its parent", () => {
    expect(() => parseStandardTerms(terms("1. One.", "        a. Too deep."), "t.md")).toThrow(
      /nested too deeply/,
    );
  });

  it("rejects templates with no clauses", () => {
    expect(() => parseStandardTerms(terms(), "t.md")).toThrow(/no numbered clauses/);
  });

  it("names the offending file in errors", () => {
    expect(() => parseStandardTerms("", "custom.md")).toThrow(/custom\.md/);
  });
});

describe("loadStandardTerms", () => {
  it.each(DOCUMENTS.map((d) => [d.id, d.standardTerms]))("parses %s's template", async (_, file) => {
    const terms = await loadStandardTerms(file, REPO_ROOT);
    expect(terms.clauses.length).toBeGreaterThan(2);
    for (const clause of flatten(terms.clauses)) {
      expect(plain(clause.body)).not.toMatch(/\*\*|<span|<\/span>|\]\(/);
    }
    // It crosses the server/client boundary, so it must be JSON-serializable.
    expect(JSON.parse(JSON.stringify(terms))).toEqual(terms);
  });

  it("fails clearly when a template is missing", async () => {
    await expect(loadStandardTerms("templates/does-not-exist.md", REPO_ROOT)).rejects.toThrow(/ENOENT/);
  });
});
