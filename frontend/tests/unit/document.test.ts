import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coverPageSections,
  creatorHref,
  defaultDocumentData,
  defaultValue,
  emptyDocumentData,
  formatDate,
  partyHeadings,
  partyRows,
  pdfFileName,
  todayIso,
  withDefaultDates,
  type CoverSection,
} from "@/lib/document";
import { DOCUMENTS, definition, documentData, filledNdaData, NDA } from "../fixtures";

const section = (sections: CoverSection[], heading: string) => {
  const found = sections.find((s) => s.heading === heading);
  if (!found) throw new Error(`No section "${heading}"`);
  return found;
};

const ndaSections = (fields = {}) => coverPageSections(NDA, filledNdaData(fields));

describe("defaultDocumentData", () => {
  it("starts the NDA from the template's suggested defaults", () => {
    const { documentId, fields, parties } = defaultDocumentData(NDA);
    expect(documentId).toBe("mutual-nda");
    expect(fields).toEqual({
      purpose: "Evaluating whether to enter into a business relationship with the other party.",
      effectiveDate: "",
      mndaTermType: "fixed",
      mndaTermYears: 1,
      confidentialityType: "fixed",
      confidentialityYears: 1,
      governingLaw: "",
      jurisdiction: "",
      modifications: "",
    });
    expect(parties).toHaveLength(2);
  });

  it("returns independent objects on each call", () => {
    const a = defaultDocumentData(NDA);
    const b = defaultDocumentData(NDA);
    a.parties[0].company = "Mutated";
    a.fields.purpose = "Mutated";
    expect(b.parties[0].company).toBe("");
    expect(b.fields.purpose).not.toBe("Mutated");
    expect(a.parties[0]).not.toBe(a.parties[1]);
  });

  it("gives every field of every document a default", () => {
    for (const doc of DOCUMENTS) {
      const { fields } = defaultDocumentData(doc);
      expect(Object.keys(fields)).toEqual(doc.fields.map((f) => f.key));
    }
  });
});

describe("defaultValue", () => {
  it("uses the field's default, or blank", () => {
    const base = { key: "k", label: "K", guidance: "" };
    expect(defaultValue({ ...base, kind: "years", default: 2 })).toBe(2);
    expect(defaultValue({ ...base, kind: "text" })).toBe("");
    expect(defaultValue({ ...base, kind: "text", default: "x" })).toBe("x");
  });

  it("has an explicit default for every years and choice field (the backend checks too)", () => {
    for (const field of DOCUMENTS.flatMap((d) => d.fields)) {
      if (field.kind === "years" || field.kind === "choice") expect(field.default, field.key).toBeDefined();
    }
  });
});

describe("emptyDocumentData", () => {
  it("has no document or fields yet", () => {
    expect(emptyDocumentData()).toMatchObject({ documentId: null, fields: {} });
  });
});

describe("withDefaultDates", () => {
  it("shows blank dates as today and keeps set ones", () => {
    const csa = definition("cloud-service-agreement");
    const data = documentData(csa, { orderDate: "2027-01-15" });
    const shown = withDefaultDates(csa, data, "2026-10-05");
    expect(shown.fields.effectiveDate).toBe("2026-10-05");
    expect(shown.fields.orderDate).toBe("2027-01-15");
    expect(data.fields.effectiveDate).toBe(""); // not mutated
  });
});

describe("todayIso", () => {
  afterEach(() => vi.useRealTimers());

  it("formats the local date as YYYY-MM-DD with zero padding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59)); // Jan 5, local time
    expect(todayIso()).toBe("2026-01-05");
  });
});

describe("formatDate", () => {
  it.each([
    ["2026-10-05", "October 5, 2026"],
    ["2024-02-29", "February 29, 2024"],
    ["2026-01-01", "January 1, 2026"],
    ["2026-12-31", "December 31, 2026"],
  ])("formats %s as %s", (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });

  it("does not map two-digit years into the 1900s", () => {
    expect(formatDate("0025-03-01")).toBe("March 1, 25");
  });

  it.each(["", "not-a-date", "2026-13", "2026--05"])(
    "returns an empty string for invalid input %j",
    (iso) => {
      expect(formatDate(iso)).toBe("");
    },
  );
});

describe("creatorHref", () => {
  it("preselects a document, or leaves the choice to the chat", () => {
    expect(creatorHref("mutual-nda")).toBe("/app/create/?doc=mutual-nda");
    expect(creatorHref()).toBe("/app/create/");
  });
});

describe("coverPageSections", () => {
  it("lists the NDA cover page sections in template order", () => {
    expect(ndaSections().map((s) => s.heading)).toEqual([
      "Purpose",
      "Effective Date",
      "MNDA Term",
      "Term of Confidentiality",
      "Governing Law & Jurisdiction",
      "MNDA Modifications",
    ]);
  });

  it("fills in the user's values", () => {
    const sections = ndaSections();
    expect(section(sections, "Purpose").lines).toEqual(["Exploring a joint go-to-market partnership."]);
    expect(section(sections, "Effective Date").lines).toEqual(["October 5, 2026"]);
    expect(section(sections, "Governing Law & Jurisdiction").lines).toEqual([
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
    ]);
    expect(section(sections, "MNDA Modifications").lines).toEqual([
      "Section 6 retention period is limited to 90 days.",
    ]);
  });

  it("uses placeholders for blank required fields and empty text for optional ones", () => {
    const sections = coverPageSections(NDA, defaultDocumentData(NDA));
    expect(section(sections, "Effective Date").lines).toEqual(["[Effective Date]"]);
    expect(section(sections, "Governing Law & Jurisdiction").lines).toEqual([
      "Governing Law: [Governing Law]",
      "Jurisdiction: [Jurisdiction]",
    ]);
    expect(section(sections, "MNDA Modifications").lines).toEqual(["None."]);
    expect(section(ndaSections({ purpose: " " }), "Purpose").lines).toEqual(["[Purpose]"]);
  });

  it("checks exactly one MNDA term option, with singular/plural years", () => {
    const fixedOne = section(ndaSections({ mndaTermYears: 1 }), "MNDA Term").options!;
    expect(fixedOne.map((o) => o.checked)).toEqual([true, false]);
    expect(fixedOne[0].text).toBe("Expires 1 year from Effective Date.");

    const fixedMany = section(ndaSections({ mndaTermYears: 5 }), "MNDA Term").options!;
    expect(fixedMany[0].text).toBe("Expires 5 years from Effective Date.");

    const open = section(ndaSections({ mndaTermType: "open" }), "MNDA Term").options!;
    expect(open.map((o) => o.checked)).toEqual([false, true]);
    expect(open[1].text).toBe("Continues until terminated in accordance with the terms of the MNDA.");
  });

  it("checks exactly one confidentiality option", () => {
    const fixed = section(ndaSections({ confidentialityYears: 3 }), "Term of Confidentiality").options!;
    expect(fixed.map((o) => o.checked)).toEqual([true, false]);
    expect(fixed[0].text).toMatch(/^3 years from Effective Date, but in the case of trade secrets/);

    const perpetual = section(ndaSections({ confidentialityType: "open" }), "Term of Confidentiality")
      .options!;
    expect(perpetual.map((o) => o.checked)).toEqual([false, true]);
    expect(perpetual[1].text).toBe("In perpetuity.");
  });

  it("includes the fields' helper labels", () => {
    const sections = ndaSections();
    expect(section(sections, "Purpose").label).toBe("How Confidential Information may be used");
    expect(section(sections, "MNDA Term").label).toBe("The length of this MNDA");
    expect(section(sections, "Term of Confidentiality").label).toBe(
      "How long Confidential Information is protected",
    );
  });

  it("shows other documents' fields, defaults and placeholders", () => {
    const csa = definition("cloud-service-agreement");
    const sections = coverPageSections(csa, documentData(csa, { fees: "$1,000 per month" }));
    expect(section(sections, "Fees").lines).toEqual(["$1,000 per month"]);
    expect(section(sections, "Subscription Period").lines).toEqual(["1 year"]);
    expect(section(sections, "Cloud Service").lines).toEqual(["[Cloud Service]"]);
    expect(section(sections, "DPA").lines).toEqual(["None."]);
    expect(section(sections, "Governing Law & Chosen Courts").lines).toEqual([
      "Governing Law: [Governing Law]",
      "Chosen Courts: [Chosen Courts]",
    ]);
  });

  it("gives every document a section per field (or shared section)", () => {
    for (const doc of DOCUMENTS) {
      const headings = coverPageSections(doc, defaultDocumentData(doc)).map((s) => s.heading);
      expect(new Set(headings).size).toBe(headings.length);
      for (const field of doc.fields) {
        if (field.kind !== "years") expect(headings).toContain(field.section ?? field.label);
      }
    }
  });
});

describe("partyHeadings", () => {
  it("uses the document's party roles", () => {
    expect(partyHeadings(NDA)).toEqual(["PARTY 1", "PARTY 2"]);
    expect(partyHeadings(definition("partnership-agreement"))).toEqual(["COMPANY", "PARTNER"]);
  });
});

describe("partyRows", () => {
  it("lays out the signature table rows in template order", () => {
    expect(partyRows(filledNdaData()).map((r) => r.label)).toEqual([
      "Signature",
      "Print Name",
      "Title",
      "Company",
      "Notice Address",
      "Date",
    ]);
  });

  it("fills party details side by side, trimmed", () => {
    const data = filledNdaData();
    data.parties[0].company = "  Acme, Inc.  ";
    const rows = Object.fromEntries(partyRows(data).map((r) => [r.label, r.values]));
    expect(rows["Print Name"]).toEqual(["Jane Doe", "John Roe"]);
    expect(rows["Title"]).toEqual(["CEO", "CTO"]);
    expect(rows["Company"]).toEqual(["Acme, Inc.", "Globex LLC"]);
    expect(rows["Notice Address"]).toEqual(["legal@acme.com", "1 Main St, Springfield, IL"]);
  });

  it("leaves Signature and Date blank, and marks the signature row", () => {
    const rows = partyRows(filledNdaData());
    const signature = rows.find((r) => r.label === "Signature")!;
    const date = rows.find((r) => r.label === "Date")!;
    expect(signature.values).toEqual(["", ""]);
    expect(signature.signature).toBe(true);
    expect(date.values).toEqual(["", ""]);
    expect(rows.filter((r) => r.signature)).toHaveLength(1);
  });

  it("adds the notice address hint", () => {
    const notice = partyRows(filledNdaData()).find((r) => r.label === "Notice Address")!;
    expect(notice.hint).toBe("Use either email or postal address");
  });
});

describe("pdfFileName", () => {
  const withCompanies = (a: string, b: string, doc = NDA) => {
    const data = filledNdaData();
    data.parties[0].company = a;
    data.parties[1].company = b;
    return pdfFileName(doc, data);
  };

  it("includes both company names as slugs", () => {
    expect(withCompanies("Acme, Inc.", "Globex LLC")).toBe("Mutual-NDA-Acme-Inc-Globex-LLC.pdf");
  });

  it("starts with the document's file slug", () => {
    expect(withCompanies("Acme", "Globex", definition("cloud-service-agreement"))).toBe(
      "Cloud-Service-Agreement-Acme-Globex.pdf",
    );
  });

  it("falls back to a generic name without companies", () => {
    expect(withCompanies("", "  ")).toBe("Mutual-NDA.pdf");
  });

  it("omits a missing company", () => {
    expect(withCompanies("", "Globex")).toBe("Mutual-NDA-Globex.pdf");
  });

  it("strips characters that are unsafe in filenames", () => {
    expect(withCompanies('A/B\\C:D*E?"F<G>H|I', "../../etc")).toBe(
      "Mutual-NDA-A-B-C-D-E-F-G-H-I-etc.pdf",
    );
  });

  it("transliterates accented Latin characters", () => {
    expect(withCompanies("Müller & Söhne", "Café Crème")).toBe(
      "Mutual-NDA-Muller-Sohne-Cafe-Creme.pdf",
    );
  });

  it("drops names with no usable characters", () => {
    expect(withCompanies("株式会社", "Globex")).toBe("Mutual-NDA-Globex.pdf");
  });

  it("caps each company slug at 40 characters", () => {
    const name = withCompanies("A".repeat(200), "B".repeat(200));
    expect(name).toBe(`Mutual-NDA-${"A".repeat(40)}-${"B".repeat(40)}.pdf`);
  });

  it("never leaves leading or trailing dashes after truncation", () => {
    const name = withCompanies(`${"A".repeat(39)} Z`, "Globex");
    expect(name).toBe(`Mutual-NDA-${"A".repeat(39)}-Globex.pdf`);
  });
});
