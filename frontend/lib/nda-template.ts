/**
 * Loads the Common Paper Mutual NDA text from the repo's `templates/` folder
 * (the single source of truth listed in catalog.json) and parses it into a
 * small, serializable structure the preview and PDF renderers can share.
 *
 * Server-only: uses the filesystem, so call it from a Server Component.
 */
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
  coverAttribution: Inline[];
  standardTerms: TermSection[];
  standardTermsAttribution: Inline[];
}

const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

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

function parseStandardTerms(markdown: string) {
  const standardTerms: TermSection[] = [];
  let attribution = "";
  for (const line of markdown.split(/\r?\n/).map((l) => l.trim())) {
    if (!line || line.startsWith("#")) continue;
    const section = line.match(SECTION_PATTERN);
    if (section) {
      standardTerms.push({
        number: Number(section[1]),
        title: section[2],
        body: parseInline(section[3]),
      });
    } else {
      attribution = line;
    }
  }
  return { standardTerms, standardTermsAttribution: parseInline(attribution) };
}

function parseCoverPage(markdown: string) {
  const lines = markdown.split(/\r?\n/).map((l) => l.trim());
  const usingHeading = lines.findIndex((l) => /^##\s+USING THIS/i.test(l));
  const intro = lines.slice(usingHeading + 1).find(Boolean) ?? "";
  const attribution = lines.findLast((l) => l.startsWith("Common Paper")) ?? "";
  return {
    coverIntro: parseInline(intro),
    coverAttribution: parseInline(attribution),
  };
}

export async function loadNdaTemplate(): Promise<NdaTemplate> {
  const [coverPage, standardTerms] = await Promise.all([
    readFile(path.join(TEMPLATES_DIR, "Mutual-NDA-coverpage.md"), "utf8"),
    readFile(path.join(TEMPLATES_DIR, "Mutual-NDA.md"), "utf8"),
  ]);
  const template = {
    ...parseCoverPage(coverPage),
    ...parseStandardTerms(standardTerms),
  };
  if (template.standardTerms.length === 0) {
    throw new Error("Failed to parse Mutual NDA standard terms from template");
  }
  return template;
}
