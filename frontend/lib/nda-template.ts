/**
 * Loads the Common Paper Mutual NDA text from the repo's `templates/` folder
 * (the single source of truth listed in catalog.json) and parses it into a
 * small, serializable structure the preview and PDF renderers can share.
 *
 * Server-only: uses the filesystem, so call it from a Server Component.
 * Parsing is strict: if the template's structure changes, the build fails
 * rather than silently dropping legal text or the CC BY attribution.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Inline content parsed from the template's markdown/HTML. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string }
  /** A reference to a Cover Page term, e.g. "Purpose" or "Effective Date". */
  | { kind: "term"; text: string };

export interface TermSection {
  number: number;
  title: string;
  body: Inline[];
}

export interface NdaTemplate {
  /** "Using this Mutual Non-Disclosure Agreement" paragraph from the cover page. */
  coverIntro: Inline[];
  /** CC BY 4.0 attribution line at the end of the cover page. */
  coverAttribution: Inline[];
  standardTerms: TermSection[];
  standardTermsAttribution: Inline[];
}

// Assumes commands run from frontend/ inside the full repo checkout.
const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

export class TemplateParseError extends Error {
  constructor(file: string, problem: string) {
    super(`Mutual NDA template ${file}: ${problem}`);
    this.name = "TemplateParseError";
  }
}

const INLINE_PATTERN =
  /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)|<span class="coverpage_link">(.+?)<\/span>/g;

export function parseInline(source: string): Inline[] {
  const result: Inline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_PATTERN)) {
    if (match.index > last) {
      result.push({ kind: "text", text: source.slice(last, match.index) });
    }
    const [, bold, linkText, href, term] = match;
    if (bold !== undefined) result.push({ kind: "bold", text: bold });
    else if (term !== undefined) result.push({ kind: "term", text: term });
    else result.push({ kind: "link", text: linkText, href });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    result.push({ kind: "text", text: source.slice(last) });
  }
  return result;
}

const SECTION_PATTERN = /^(\d+)\.\s+\*\*(.+?)\*\*\.\s+(.*)$/;

const ATTRIBUTION_PATTERN = /^Common Paper .*CC BY 4\.0/;

const contentLines = (markdown: string) =>
  markdown
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export function parseStandardTerms(markdown: string, file = "Mutual-NDA.md") {
  const standardTerms: TermSection[] = [];
  const lines = contentLines(markdown).filter((l) => !l.startsWith("#"));
  // Every line is a numbered section, except the final attribution line.
  const attribution = lines.at(-1) ?? "";
  if (!ATTRIBUTION_PATTERN.test(attribution)) {
    throw new TemplateParseError(file, "missing CC BY 4.0 attribution line");
  }
  for (const line of lines.slice(0, -1)) {
    const section = line.match(SECTION_PATTERN);
    if (!section) {
      throw new TemplateParseError(file, `unrecognized line: "${line.slice(0, 60)}"`);
    }
    standardTerms.push({
      number: Number(section[1]),
      title: section[2],
      body: parseInline(section[3]),
    });
  }
  if (standardTerms.length === 0) {
    throw new TemplateParseError(file, "no numbered sections found");
  }
  return { standardTerms, standardTermsAttribution: parseInline(attribution) };
}

export function parseCoverPage(markdown: string, file = "Mutual-NDA-coverpage.md") {
  const lines = contentLines(markdown);
  const usingHeading = lines.findIndex((l) => /^##\s+USING THIS/i.test(l));
  const intro = usingHeading >= 0 ? lines[usingHeading + 1] : undefined;
  if (!intro || intro.startsWith("#")) {
    throw new TemplateParseError(file, 'missing "Using this" introduction');
  }
  const attribution = lines.findLast((l) => ATTRIBUTION_PATTERN.test(l));
  if (!attribution) {
    throw new TemplateParseError(file, "missing CC BY 4.0 attribution line");
  }
  return {
    coverIntro: parseInline(intro),
    coverAttribution: parseInline(attribution),
  };
}

export async function loadNdaTemplate(
  templatesDir = TEMPLATES_DIR,
): Promise<NdaTemplate> {
  const [coverPage, standardTerms] = await Promise.all([
    readFile(path.join(templatesDir, "Mutual-NDA-coverpage.md"), "utf8"),
    readFile(path.join(templatesDir, "Mutual-NDA.md"), "utf8"),
  ]);
  return {
    ...parseCoverPage(coverPage),
    ...parseStandardTerms(standardTerms),
  };
}
