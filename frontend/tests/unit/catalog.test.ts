import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCreatorDocuments, loadDocuments } from "@/lib/catalog";
import { REPO_ROOT } from "../fixtures";

const plain = (content: { text: string }[]) => content.map((p) => p.text).join("");

describe("loadDocuments", () => {
  it("loads every document users can draft, starting with the Mutual NDA", async () => {
    const docs = await loadDocuments(REPO_ROOT);
    expect(docs[0]).toMatchObject({ id: "mutual-nda", name: "Mutual Non-Disclosure Agreement" });
    expect(docs.map((d) => d.name)).toContain("Cloud Service Agreement");
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });

  it("covers every template in catalog.json", async () => {
    const docs = await loadDocuments(REPO_ROOT);
    const { templates } = JSON.parse(await readFile(path.join(REPO_ROOT, "catalog.json"), "utf8"));
    // The NDA's cover page is defined in documents.json, not parsed from its template.
    const files = templates
      .map((t: { filename: string }) => t.filename)
      .filter((f: string) => f !== "templates/Mutual-NDA-coverpage.md");
    expect(docs.map((d) => d.standardTerms).sort()).toEqual(files.sort());
  });
});

describe("loadCreatorDocuments", () => {
  it("parses each document's intro, attribution and Standard Terms", async () => {
    const docs = await loadCreatorDocuments(REPO_ROOT);
    expect(docs).toHaveLength((await loadDocuments(REPO_ROOT)).length);
    for (const doc of docs) {
      expect(plain(doc.intro)).toMatch(/consists of/);
      expect(plain(doc.attribution)).toMatch(/^Common Paper .* free to use under CC BY 4\.0\.$/);
      expect(doc.terms.clauses.length).toBeGreaterThan(2);
    }
    const nda = docs[0];
    expect(nda.intro.find((p) => p.kind === "link")).toEqual({
      kind: "link",
      text: "commonpaper.com/standards/mutual-nda/1.0",
      href: "https://commonpaper.com/standards/mutual-nda/1.0",
    });
    expect(nda.terms.clauses).toHaveLength(11);
  });
});
