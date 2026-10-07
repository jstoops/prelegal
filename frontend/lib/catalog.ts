/**
 * Reads the repo's documents.json (the documents users can draft) and their
 * Standard Terms templates at build time.
 *
 * Server-only: uses the filesystem, so call it from a Server Component.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentDefinition } from "@/lib/document";
import { loadStandardTerms, parseInline, type Inline, type StandardTerms } from "@/lib/template";

// Assumes commands run from frontend/ inside the full repo checkout.
const REPO_ROOT = path.join(process.cwd(), "..");

/** Everything the creator needs to show and download one document. */
export interface CreatorDocument {
  definition: DocumentDefinition;
  intro: Inline[];
  attribution: Inline[];
  terms: StandardTerms;
}

export async function loadDocuments(repoRoot = REPO_ROOT): Promise<DocumentDefinition[]> {
  const file = path.join(repoRoot, "documents.json");
  const { documents } = JSON.parse(await readFile(file, "utf8")) as {
    documents: DocumentDefinition[];
  };
  return documents;
}

export async function loadCreatorDocuments(repoRoot = REPO_ROOT): Promise<CreatorDocument[]> {
  const documents = await loadDocuments(repoRoot);
  return Promise.all(
    documents.map(async (definition) => ({
      definition,
      intro: parseInline(definition.intro, `documents.json (${definition.id})`),
      attribution: parseInline(definition.attribution, `documents.json (${definition.id})`),
      terms: await loadStandardTerms(definition.standardTerms, repoRoot),
    })),
  );
}
