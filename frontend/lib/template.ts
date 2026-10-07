/**
 * Loads Common Paper Standard Terms from the repo's `templates/` folder (the
 * files listed in catalog.json and documents.json) and parses them into a small,
 * serializable structure the preview and PDF renderers share.
 *
 * Server-only: uses the filesystem, so call it from a Server Component.
 * Parsing is strict: if a template uses markup this parser doesn't know, the
 * build fails rather than silently dropping or garbling legal text.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Inline content parsed from the template's markdown/HTML. */
export type Inline =
  | { kind: "text"; text: string; bold?: boolean }
  | { kind: "link"; text: string; href: string; bold?: boolean }
  /** A reference to a Cover Page term, e.g. "Purpose" or "Governing Law". */
  | { kind: "term"; text: string; bold?: boolean };

/** A numbered clause, e.g. "1." with sub-clauses "1.1", "(a)" and "(i)". */
export interface Clause {
  /** The clause number as shown, e.g. "1.", "1.1", "(a)". */
  label: string;
  /** A section title, e.g. "Restrictions on Customer." */
  heading?: string;
  body: Inline[];
  children: Clause[];
}

export interface StandardTerms {
  clauses: Clause[];
  /** The template's own CC BY 4.0 attribution line, if it has one. */
  attribution?: Inline[];
}

export class TemplateParseError extends Error {
  constructor(file: string, problem: string) {
    super(`Template ${file}: ${problem}`);
    this.name = "TemplateParseError";
  }
}

// Cover Page references, whatever the template calls its cover page.
const TERM_CLASSES = "(?:coverpage|keyterms|orderform|sow|businessterms)_link";
const INLINE_PATTERN = new RegExp(
  [
    String.raw`\[(.+?)\]\((.+?)\)`, // [text](href)
    String.raw`<(https?://[^>\s]+)>`, // <https://...>
    String.raw`<span class="${TERM_CLASSES}"(?: id="[^"]*")?>(.+?)</span>`,
  ].join("|"),
  "g",
);
// Anchors only: <span id="4.2">**"Term"**</span> and <span id="4.6"></span>.
const ANCHOR_SPAN = /<span id="[^"]*">([^<]*?)<\/span>/g;
const HEADING_SPAN = /^<span class="header_[23]"(?: id="[^"]*")?>(.+?)<\/span>\s*/;
const LEFTOVER_MARKUP = /<\/?[a-z]/i;

const withScheme = (href: string) => (/^[a-z]+:/i.test(href) ? href : `https://${href}`);

function parseSegment(source: string, bold: boolean, file: string): Inline[] {
  const result: Inline[] = [];
  const flag = bold ? { bold: true as const } : {};
  const pushText = (text: string) => {
    // Leftover link syntax means a link the patterns couldn't match, e.g. one
    // with bold inside its text, which the split on ** has broken apart.
    if (LEFTOVER_MARKUP.test(text) || text.includes("](")) {
      throw new TemplateParseError(file, `unrecognized markup in "${text.slice(0, 60)}"`);
    }
    if (text) result.push({ kind: "text", text, ...flag });
  };
  let last = 0;
  for (const match of source.matchAll(INLINE_PATTERN)) {
    pushText(source.slice(last, match.index));
    const [, linkText, href, autolink, term] = match;
    if (term !== undefined) result.push({ kind: "term", text: term, ...flag });
    else if (autolink !== undefined) result.push({ kind: "link", text: autolink, href: autolink, ...flag });
    else result.push({ kind: "link", text: linkText, href: withScheme(href), ...flag });
    last = match.index + match[0].length;
  }
  pushText(source.slice(last));
  return result;
}

/** Parses inline markdown: **bold** (which may contain links and terms), links and term spans. */
export function parseInline(source: string, file = "inline text"): Inline[] {
  const parts = source.replace(ANCHOR_SPAN, "$1").split("**");
  if (parts.length % 2 === 0) {
    throw new TemplateParseError(file, `unbalanced ** in "${source.slice(0, 60)}"`);
  }
  return parts.flatMap((part, i) => parseSegment(part, i % 2 === 1, file));
}

// "1. ", "    2. ", "        a. ", "            iv. " (four spaces per level).
const CLAUSE_PATTERN = /^((?: {4})*)(\d+|[a-z]+)\.\s+(.*)$/;
const ATTRIBUTION_PATTERN = /^Common Paper .*CC BY 4\.0/;

function clauseLabel(depth: number, marker: string, parent?: Clause): string {
  if (depth === 0) return `${marker}.`;
  if (depth === 1) return `${parent!.label.replace(/\.$/, "")}.${marker}`;
  return `(${marker})`;
}

export function parseStandardTerms(markdown: string, file: string): StandardTerms {
  const clauses: Clause[] = [];
  // The innermost open clause at each depth.
  const open: Clause[] = [];
  let attribution: Inline[] | undefined;

  const lines = markdown.split(/\r?\n/).filter((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    if (index === 0 && line.startsWith("# ")) continue; // the document title
    if (index === lines.length - 1 && ATTRIBUTION_PATTERN.test(line)) {
      attribution = parseInline(line, file);
      continue;
    }
    const match = CLAUSE_PATTERN.exec(line.trimEnd());
    if (!match) {
      throw new TemplateParseError(file, `unrecognized line: "${line.trim().slice(0, 60)}"`);
    }
    const depth = match[1].length / 4;
    if (depth > open.length) {
      throw new TemplateParseError(file, `clause nested too deeply: "${line.trim().slice(0, 60)}"`);
    }
    let content = match[3];
    const heading = HEADING_SPAN.exec(content);
    if (heading) content = content.slice(heading[0].length);
    const clause: Clause = {
      label: clauseLabel(depth, match[2], open[depth - 1]),
      ...(heading && { heading: heading[1].trim() }),
      body: parseInline(content, file),
      children: [],
    };
    (depth === 0 ? clauses : open[depth - 1].children).push(clause);
    open.length = depth;
    open.push(clause);
  }
  if (clauses.length === 0) {
    throw new TemplateParseError(file, "no numbered clauses found");
  }
  return attribution ? { clauses, attribution } : { clauses };
}

/** Loads and parses a template, by its repo-relative path (e.g. "templates/CSA.md"). */
export async function loadStandardTerms(file: string, repoRoot: string): Promise<StandardTerms> {
  return parseStandardTerms(await readFile(path.join(repoRoot, file), "utf8"), file);
}
