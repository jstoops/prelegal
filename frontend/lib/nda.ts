/**
 * Mutual NDA data model and the derived cover-page content shared by the
 * HTML preview and the PDF renderer, so both always show the same document.
 */

export type TermType = "fixed" | "open";

export interface Party {
  printName: string;
  title: string;
  company: string;
  noticeAddress: string;
}

export interface NdaData {
  purpose: string;
  /** ISO date (YYYY-MM-DD); empty until set. */
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
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
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
      label: "How Confidential Information may be used",
      lines: [orPlaceholder(data.purpose, "Purpose")],
    },
    {
      heading: "Effective Date",
      lines: [orPlaceholder(formatDate(data.effectiveDate), "Effective Date")],
    },
    {
      heading: "MNDA Term",
      label: "The length of this MNDA",
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
      label: "How long Confidential Information is protected",
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
}

/** Signature and Date are intentionally left blank for signing. */
export function partyRows(data: NdaData): PartyRow[] {
  const field = (key: keyof Party) =>
    data.parties.map((p) => p[key].trim()) as [string, string];
  return [
    { label: "Signature", values: ["", ""] },
    { label: "Print Name", values: field("printName") },
    { label: "Title", values: field("title") },
    { label: "Company", values: field("company") },
    {
      label: "Notice Address",
      hint: "Use either email or postal address",
      values: field("noticeAddress"),
    },
    { label: "Date", values: ["", ""] },
  ];
}

export function pdfFileName(data: NdaData): string {
  const slug = (s: string) =>
    s.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const companies = data.parties.map((p) => slug(p.company)).filter(Boolean);
  return ["Mutual-NDA", ...companies].join("-") + ".pdf";
}
