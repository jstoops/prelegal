/**
 * The documents users can draft (defined in the repo's documents.json, shared
 * with the backend), their data, and the derived Cover Page content shared by
 * the HTML preview and the PDF renderer, so both always show the same document.
 */

export type FieldKind = "text" | "longtext" | "date" | "years" | "choice";
export type FieldValue = string | number;

export interface ChoiceOption {
  value: string;
  /** May embed a years field as `{key}`, e.g. "Expires {mndaTermYears} from Effective Date." */
  text: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
  /** What the field holds, for the AI assistant. */
  guidance: string;
  /** Caption shown under the heading. */
  hint?: string;
  /** Fields sharing a section are shown under one heading, as "Label: value". */
  section?: string;
  required?: boolean;
  default?: FieldValue;
  /** Shown when an optional field is blank, e.g. "None.". */
  emptyText?: string;
  options?: ChoiceOption[];
}

export interface DocumentDefinition {
  id: string;
  name: string;
  description: string;
  /** Repo-relative path of the Standard Terms template. */
  standardTerms: string;
  /** Start of the PDF's file name, e.g. "Mutual-NDA". */
  fileSlug: string;
  /** The parties' roles, e.g. ["Provider", "Customer"]. */
  parties: [string, string];
  /** Inline markdown introducing the Cover Page. */
  intro: string;
  signingStatement: string;
  /** Inline markdown CC BY 4.0 attribution for the Cover Page. */
  attribution: string;
  fields: FieldDefinition[];
}

export interface Party {
  printName: string;
  title: string;
  company: string;
  noticeAddress: string;
}

/** Mirrors `DocumentData` in backend documents.py. */
export interface DocumentData {
  /** The chosen document; null until the user and the assistant pick one. */
  documentId: string | null;
  /**
   * Cover Page values by field key. Dates are YYYY-MM-DD, or empty when not
   * set (the creator then shows today); years are whole numbers.
   */
  fields: Record<string, FieldValue>;
  parties: [Party, Party];
}

/** Document text rendered identically by the preview and the PDF. */
export const STANDARD_TERMS_TITLE = "Standard Terms";

/** Shown in the app, on the preview and on every page of the PDF. */
export const DRAFT_DISCLAIMER =
  "Documents created with Prelegal are drafts and are subject to legal review. Have a qualified " +
  "lawyer review them before you sign or rely on them. Prelegal does not provide legal advice.";
const NOTICE_ADDRESS_HINT = "Use either email or postal address";

/** The creator's URL, with a document preselected or, without one, chosen in the chat. */
export const creatorHref = (documentId?: string) =>
  documentId ? `/app/create/?doc=${encodeURIComponent(documentId)}` : "/app/create/";

const emptyParty = (): Party => ({ printName: "", title: "", company: "", noticeAddress: "" });

/**
 * Mirrors `default_value` in backend documents.py. Years and choice fields
 * always have an explicit default (the backend checks), so blank is the only
 * fallback.
 */
export const defaultValue = (field: FieldDefinition): FieldValue => field.default ?? "";

/** No document chosen yet. */
export const emptyDocumentData = (): DocumentData => ({
  documentId: null,
  fields: {},
  parties: [emptyParty(), emptyParty()],
});

/** A new document, with every field at its default. */
export const defaultDocumentData = (doc: DocumentDefinition): DocumentData => ({
  ...emptyDocumentData(),
  documentId: doc.id,
  fields: Object.fromEntries(doc.fields.map((f) => [f.key, defaultValue(f)])),
});

/** `data` with blank dates shown as `today`. */
export function withDefaultDates(doc: DocumentDefinition, data: DocumentData, today: string): DocumentData {
  const fields = { ...data.fields };
  for (const field of doc.fields) {
    if (field.kind === "date" && !fields[field.key]) fields[field.key] = today;
  }
  return { ...data, fields };
}

/** Today's date as YYYY-MM-DD in the user's local time zone. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  date.setFullYear(year); // the constructor maps years 0-99 to 1900-1999
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Mirrors `years_text` in backend documents.py. */
export const yearsText = (n: number) => `${n} year${n === 1 ? "" : "s"}`;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Years fields shown inside a choice option rather than on their own. */
function embeddedKeys(doc: DocumentDefinition): Set<string> {
  return new Set(
    doc.fields.flatMap((f) => (f.options ?? []).flatMap((o) => [...o.text.matchAll(PLACEHOLDER)].map((m) => m[1]))),
  );
}

/** A field's value as text, or its empty text / placeholder when blank. */
function displayValue(field: FieldDefinition, value: FieldValue | undefined): string {
  if (field.kind === "years") return yearsText(Number(value));
  const text = field.kind === "date" ? formatDate(String(value ?? "")) : String(value ?? "");
  return text.trim() || field.emptyText || `[${field.label}]`;
}

export interface CheckOption {
  checked: boolean;
  text: string;
}

export interface CoverSection {
  heading: string;
  /** Helper caption shown under the heading. */
  label?: string;
  lines?: string[];
  options?: CheckOption[];
}

export function coverPageSections(doc: DocumentDefinition, data: DocumentData): CoverSection[] {
  const embedded = embeddedKeys(doc);
  const sections: CoverSection[] = [];
  const grouped = new Map<string, CoverSection>();
  for (const field of doc.fields) {
    if (embedded.has(field.key)) continue;
    const value = data.fields[field.key];
    if (field.section) {
      let section = grouped.get(field.section);
      if (!section) {
        section = { heading: field.section, lines: [] };
        grouped.set(field.section, section);
        sections.push(section);
      }
      section.lines!.push(`${field.label}: ${displayValue(field, value)}`);
    } else if (field.kind === "choice") {
      sections.push({
        heading: field.label,
        label: field.hint,
        options: field.options!.map((option) => ({
          checked: option.value === value,
          text: option.text.replace(PLACEHOLDER, (_, key) => yearsText(Number(data.fields[key]))),
        })),
      });
    } else {
      sections.push({ heading: field.label, label: field.hint, lines: [displayValue(field, value)] });
    }
  }
  return sections;
}

export interface PartyRow {
  label: string;
  /** Caption shown under the row label. */
  hint?: string;
  values: [string, string];
  /** Rendered with extra height to leave room for a handwritten signature. */
  signature?: boolean;
}

/** Applies `f` to both items of a pair, keeping it a pair. */
const both = <T, U>([a, b]: [T, T], f: (item: T) => U): [U, U] => [f(a), f(b)];

/** Column headings of the signature table, e.g. "PROVIDER". */
export const partyHeadings = (doc: DocumentDefinition) => both(doc.parties, (p) => p.toUpperCase());

/** Signature and Date are intentionally left blank for signing. */
export function partyRows(data: DocumentData): PartyRow[] {
  const field = (key: keyof Party) => both(data.parties, (p) => p[key].trim());
  return [
    { label: "Signature", values: ["", ""], signature: true },
    { label: "Print Name", values: field("printName") },
    { label: "Title", values: field("title") },
    { label: "Company", values: field("company") },
    { label: "Notice Address", hint: NOTICE_ADDRESS_HINT, values: field("noticeAddress") },
    { label: "Date", values: ["", ""] },
  ];
}

const MAX_SLUG_LENGTH = 40;

export function pdfFileName(doc: DocumentDefinition, data: DocumentData): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/\p{M}/gu, "") // drop accents split off by NFKD: é -> e
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/^-+|-+$/g, "");
  const companies = data.parties.map((p) => slug(p.company)).filter(Boolean);
  return [doc.fileSlug, ...companies].join("-") + ".pdf";
}
