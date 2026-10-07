import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogDocuments, loadCatalog } from "@/lib/catalog";

/** The repo's real catalog (tests run from frontend/). */
const CATALOG_FILE = path.resolve(__dirname, "..", "..", "..", "catalog.json");

const entry = (name: string, description = `${name} terms.`) => ({
  name,
  description,
  filename: `templates/${name}.md`,
});

describe("catalogDocuments", () => {
  it("merges a document's Cover Page and Standard Terms into one entry", () => {
    const docs = catalogDocuments([
      entry("Mutual Non-Disclosure Agreement - Cover Page", "Cover page."),
      entry("Mutual Non-Disclosure Agreement - Standard Terms", "How parties share secrets."),
      entry("Pilot Agreement"),
    ]);
    expect(docs).toEqual([
      {
        name: "Mutual Non-Disclosure Agreement",
        description: "How parties share secrets.",
        href: "/app/nda/",
      },
      { name: "Pilot Agreement", description: "Pilot Agreement terms.", href: undefined },
    ]);
  });

  it("keeps the Standard Terms description whichever part comes first", () => {
    const docs = catalogDocuments([
      entry("Mutual Non-Disclosure Agreement - Standard Terms", "How parties share secrets."),
      entry("Mutual Non-Disclosure Agreement - Cover Page", "Cover page."),
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0].description).toBe("How parties share secrets.");
  });

  it("fails loudly if a document with a creator is missing from the catalog", () => {
    expect(() => catalogDocuments([entry("Pilot Agreement")])).toThrow(
      /no entry for "Mutual Non-Disclosure Agreement"/,
    );
  });
});

describe("loadCatalog", () => {
  it("loads the repo's catalog: the Mutual NDA is creatable, the rest are coming soon", async () => {
    const docs = await loadCatalog(CATALOG_FILE);
    expect(docs[0]).toMatchObject({ name: "Mutual Non-Disclosure Agreement", href: "/app/nda/" });
    expect(docs.filter((d) => d.href)).toHaveLength(1);
    expect(docs.map((d) => d.name)).toContain("Cloud Service Agreement");
    expect(docs.some((d) => / - (Cover Page|Standard Terms)$/.test(d.name))).toBe(false);
    // Every catalog entry is accounted for (the two NDA parts become one).
    const { templates } = JSON.parse(await readFile(CATALOG_FILE, "utf8"));
    expect(docs).toHaveLength(templates.length - 1);
  });
});
