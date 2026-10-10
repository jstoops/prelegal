/**
 * The user's saved documents (`/api/documents`). They're created and updated
 * by the chat (see lib/chat.ts); here they're listed, opened and deleted.
 */

import { ApiError, apiFetch } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat";
import type { DocumentData } from "@/lib/document";

export interface DraftSummary {
  id: string;
  /** The catalog document, e.g. "mutual-nda". */
  documentId: string;
  /** The document's name, with the parties' companies once known. */
  title: string;
  /** ISO timestamp. */
  updatedAt: string;
}

export interface Draft extends DraftSummary {
  data: DocumentData;
  messages: ChatMessage[];
}

const LIST_ERROR = "Couldn't load your documents. Please try again.";
const OPEN_ERROR = "Couldn't open this document. Please try again.";

export async function listDrafts(signal?: AbortSignal): Promise<DraftSummary[]> {
  const result = await apiFetch("/api/documents", { signal, fallbackError: LIST_ERROR });
  const documents = (result as { documents?: unknown } | undefined)?.documents;
  if (!Array.isArray(documents)) throw new ApiError(LIST_ERROR);
  return documents as DraftSummary[];
}

export async function getDraft(id: string, signal?: AbortSignal): Promise<Draft> {
  const draft = (await apiFetch(`/api/documents/${encodeURIComponent(id)}`, {
    signal,
    fallbackError: OPEN_ERROR,
  })) as Draft | undefined;
  if (!draft?.data || !Array.isArray(draft.messages)) throw new ApiError(OPEN_ERROR);
  return draft;
}

export async function deleteDraft(id: string): Promise<void> {
  await apiFetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackError: "Couldn't delete this document. Please try again.",
  });
}

/** Where a saved document opens: the creator, resuming its conversation. */
export const draftHref = (id: string) => `/app/create/?id=${encodeURIComponent(id)}`;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "3 hours ago", then the date. */
export function formatUpdated(iso: string, now = new Date()): string {
  const updated = new Date(iso);
  const elapsed = now.getTime() - updated.getTime();
  if (Number.isNaN(elapsed)) return "";
  if (elapsed < MINUTE) return "just now";
  const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  return updated.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
