/**
 * Mutual NDA data model and the derived cover-page content shared by the
 * HTML preview and the PDF renderer, so both always show the same document.
 */
import type { Inline, NdaTemplate } from "@/lib/nda-template";

export type TermType = "fixed" | "open";

/** Document text rendered identically by the preview and the PDF. */
export const NDA_TITLE = "Mutual Non-Disclosure Agreement";
export const STANDARD_TERMS_TITLE = "Standard Terms";
export const SIGNING_STATEMENT =
  "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.";
export const PARTY_HEADINGS = ["PARTY 1", "PARTY 2"] as const;

/** Captions from the template's `<label>`s, also used as form hints. */
export const COVER_HINTS = {
  purpose: "How Confidential Information may be used",
  mndaTerm: "The length of this MNDA",
  confidentiality: "How long Confidential Information is protected",
  noticeAddress: "Use either email or postal address",
} as const;

export const MIN_YEARS = 1;
export const MAX_YEARS = 99;

/** Parses a whole number of years in [MIN_YEARS, MAX_YEARS]; null if invalid. */
export function parseYears(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const years = Number(value);
  return years >= MIN_YEARS && years <= MAX_YEARS ? years : null;
}

export interface Party {
  printName: string;
  title: string;
  company: string;
  noticeAddress: string;
}

export interface NdaData {
  purpose: string;
  /** ISO date (YYYY-MM-DD); empty when not provided. */
  effectiveDate: string;
  /** "fixed" = expires after `mndaTermYears`; "open" = continues until terminated. */
  mndaTermType: TermType;
  mndaTermYears: number;
  /** "fixed" = `confidentialityYears` after Effective Date; "open" = in perpetuity. */
  confidentialityType: TermType;
  confidentialityYears: number;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  parties: [Party, Party];
}

const emptyParty = (): Party => ({
  printName: "",
  title: "",
  company: "",
  noticeAddress: "",
});

/** Defaults mirror the bracketed suggestions in templates/Mutual-NDA-coverpage.md. */
export const defaultNdaData = (): NdaData => ({
  purpose:
    "Evaluating whether to enter into a business relationship with the other party.",
  effectiveDate: "",
  mndaTermType: "fixed",
  mndaTermYears: 1,
  confidentialityType: "fixed",
  confidentialityYears: 1,
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  parties: [emptyParty(), emptyParty()],
});

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

const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;

/** Returns the value, or a bracketed placeholder when it is blank. */
export const orPlaceholder = (value: string, placeholder: string) =>
  value.trim() || `[${placeholder}]`;

export interface CheckOption {
  checked: boolean;
  text: string;
}

export interface CoverSection {
  heading: string;
  /** Helper caption shown under the heading (the template's `<label>`). */
  label?: string;
  lines?: string[];
  options?: CheckOption[];
}

export function coverPageSections(data: NdaData): CoverSection[] {
  return [
    {
      heading: "Purpose",
      label: COVER_HINTS.purpose,
      lines: [orPlaceholder(data.purpose, "Purpose")],
    },
    {
      heading: "Effective Date",
      lines: [orPlaceholder(formatDate(data.effectiveDate), "Effective Date")],
    },
    {
      heading: "MNDA Term",
      label: COVER_HINTS.mndaTerm,
      options: [
        {
          checked: data.mndaTermType === "fixed",
          text: `Expires ${years(data.mndaTermYears)} from Effective Date.`,
        },
        {
          checked: data.mndaTermType === "open",
          text: "Continues until terminated in accordance with the terms of the MNDA.",
        },
      ],
    },
    {
      heading: "Term of Confidentiality",
      label: COVER_HINTS.confidentiality,
      options: [
        {
          checked: data.confidentialityType === "fixed",
          text: `${years(data.confidentialityYears)} from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.`,
        },
        { checked: data.confidentialityType === "open", text: "In perpetuity." },
      ],
    },
    {
      heading: "Governing Law & Jurisdiction",
      lines: [
        `Governing Law: ${orPlaceholder(data.governingLaw, "Governing Law")}`,
        `Jurisdiction: ${orPlaceholder(data.jurisdiction, "Jurisdiction")}`,
      ],
    },
    {
      heading: "MNDA Modifications",
      lines: [data.modifications.trim() || "None."],
    },
  ];
}

export interface PartyRow {
  label: string;
  /** Caption shown under the row label (the template's `<label>`). */
  hint?: string;
  values: [string, string];
  /** Rendered with extra height to leave room for a handwritten signature. */
  signature?: boolean;
}

/** Signature and Date are intentionally left blank for signing. */
export function partyRows(data: NdaData): PartyRow[] {
  const field = (key: keyof Party) =>
    data.parties.map((p) => p[key].trim()) as [string, string];
  return [
    { label: "Signature", values: ["", ""], signature: true },
    { label: "Print Name", values: field("printName") },
    { label: "Title", values: field("title") },
    { label: "Company", values: field("company") },
    {
      label: "Notice Address",
      hint: COVER_HINTS.noticeAddress,
      values: field("noticeAddress"),
    },
    { label: "Date", values: ["", ""] },
  ];
}

const TEXT_FIELDS = ["purpose", "governingLaw", "jurisdiction", "modifications"] as const;
const PARTY_TEXT_FIELDS = ["printName", "title", "company", "noticeAddress"] as const;

/** Free text the user typed (the only text that can contain any script). */
export function userTexts(data: NdaData): string[] {
  return [
    ...TEXT_FIELDS.map((key) => data[key]),
    ...data.parties.flatMap((party) => PARTY_TEXT_FIELDS.map((key) => party[key])),
  ];
}

/** Applies `transform` to every free-text field. */
export function mapUserTexts(data: NdaData, transform: (text: string) => string): NdaData {
  const mapped = { ...data };
  for (const key of TEXT_FIELDS) mapped[key] = transform(data[key]);
  mapped.parties = data.parties.map((party) => {
    const copy = { ...party };
    for (const key of PARTY_TEXT_FIELDS) copy[key] = transform(party[key]);
    return copy;
  }) as NdaData["parties"];
  return mapped;
}

/**
 * Every string the PDF draws, used to decide which fonts it needs. Keep in
 * sync with NdaPdfDocument: text drawn there but missing here could be left
 * without a font. (PL-5 will derive both from one document model.)
 */
export function documentTexts(data: NdaData, template: NdaTemplate): string[] {
  const plain = (content: Inline[]) => content.map((part) => part.text).join("");
  return [
    NDA_TITLE,
    STANDARD_TERMS_TITLE,
    SIGNING_STATEMENT,
    ...PARTY_HEADINGS,
    ...coverPageSections(data).flatMap((s) => [
      s.heading,
      s.label ?? "",
      ...(s.lines ?? []),
      ...(s.options ?? []).map((o) => o.text),
    ]),
    ...partyRows(data).flatMap((r) => [r.label, r.hint ?? "", ...r.values]),
    plain(template.coverIntro),
    plain(template.coverAttribution),
    ...template.standardTerms.flatMap((s) => [`${s.number}. ${s.title}.`, plain(s.body)]),
    plain(template.standardTermsAttribution),
  ];
}

const MAX_SLUG_LENGTH = 40;

export function pdfFileName(data: NdaData): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/\p{M}/gu, "") // drop accents split off by NFKD: é -> e
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/^-+|-+$/g, "");
  const companies = data.parties.map((p) => slug(p.company)).filter(Boolean);
  return ["Mutual-NDA", ...companies].join("-") + ".pdf";
}
