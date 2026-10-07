/**
 * Reads the repo's catalog.json (the list of Common Paper templates) at build
 * time and turns it into the documents shown on the dashboard.
 *
 * Server-only: uses the filesystem, so call it from a Server Component.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface CatalogEntry {
  name: string;
  description: string;
  filename: string;
}

export interface CatalogDocument {
  name: string;
  description: string;
  /** Link to the document's creator, if users can create it today. */
  href?: string;
}

// Assumes commands run from frontend/ inside the full repo checkout.
const CATALOG_FILE = path.join(process.cwd(), "..", "catalog.json");

// Some documents come in parts (e.g. the Mutual NDA's Cover Page and Standard
// Terms). They're shown as one document described by its Standard Terms.
const PART_SUFFIX = / - (Cover Page|Standard Terms)$/;

/** Documents with a working creator, by name. */
const CREATORS: Record<string, string> = {
  "Mutual Non-Disclosure Agreement": "/app/nda/",
};

export function catalogDocuments(entries: CatalogEntry[]): CatalogDocument[] {
  const documents = new Map<string, CatalogDocument>();
  for (const { name: fullName, description } of entries) {
    const part = PART_SUFFIX.exec(fullName);
    const name = part ? fullName.slice(0, part.index) : fullName;
    const existing = documents.get(name);
    if (!existing) {
      documents.set(name, { name, description, href: CREATORS[name] });
    } else if (part?.[1] === "Standard Terms") {
      existing.description = description;
    }
  }
  for (const name of Object.keys(CREATORS)) {
    if (!documents.has(name)) {
      throw new Error(`catalog.json: no entry for "${name}", which has a creator`);
    }
  }
  return [...documents.values()];
}

export async function loadCatalog(file = CATALOG_FILE): Promise<CatalogDocument[]> {
  const { templates } = JSON.parse(await readFile(file, "utf8")) as {
    templates: CatalogEntry[];
  };
  return catalogDocuments(templates);
}
