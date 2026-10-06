import path from "node:path";
import { defaultNdaData, type NdaData } from "@/lib/nda";

/** The repo's real templates directory (tests run from frontend/). */
export const TEMPLATES_DIR = path.resolve(__dirname, "..", "..", "templates");

/** A fully filled-in NDA used across tests. */
export function filledNdaData(overrides: Partial<NdaData> = {}): NdaData {
  return {
    ...defaultNdaData(),
    purpose: "Exploring a joint go-to-market partnership.",
    effectiveDate: "2026-10-05",
    mndaTermType: "fixed",
    mndaTermYears: 2,
    confidentialityType: "fixed",
    confidentialityYears: 3,
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    modifications: "Section 6 retention period is limited to 90 days.",
    parties: [
      {
        printName: "Jane Doe",
        title: "CEO",
        company: "Acme, Inc.",
        noticeAddress: "legal@acme.com",
      },
      {
        printName: "John Roe",
        title: "CTO",
        company: "Globex LLC",
        noticeAddress: "1 Main St, Springfield, IL",
      },
    ],
    ...overrides,
  };
}
