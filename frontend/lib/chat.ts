/**
 * Client for the backend's AI chat (`POST /api/chat`). The backend is
 * stateless: each turn sends the whole conversation and the current document,
 * and gets back the assistant's reply and the document with its updates
 * applied (possibly a newly chosen document).
 *
 * Once a document is chosen and the user has said something, each turn also
 * saves it to the user's documents: the reply carries the saved copy's id,
 * which later turns send back so they update the same copy.
 */

import { ApiError, apiFetch } from "@/lib/api";
import { todayIso, type DocumentData } from "@/lib/document";

/** Longest message the backend accepts (`MAX_MESSAGE_LENGTH` in backend chat.py). */
export const MAX_MESSAGE_LENGTH = 4000;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  data: DocumentData;
  /** The saved copy's id; null until the document is first saved. */
  savedId: string | null;
}

const CHAT_ERROR = "The AI assistant is unavailable. Please try again.";

function isChatResult(value: unknown): value is ChatResult {
  const result = value as ChatResult | null;
  return (
    typeof result?.reply === "string" &&
    (typeof result.savedId === "string" || result.savedId === null) &&
    (typeof result.data?.documentId === "string" || result.data?.documentId === null) &&
    typeof result.data.fields === "object" &&
    result.data.fields !== null &&
    result.data.parties?.length === 2
  );
}

interface ChatOptions {
  /** The saved copy to update, once there is one. */
  savedId?: string | null;
  signal?: AbortSignal;
}

/** Sends one chat turn. Pass an empty `messages` to get the opening greeting. */
export async function sendChat(
  messages: ChatMessage[],
  data: DocumentData,
  { savedId = null, signal }: ChatOptions = {},
): Promise<ChatResult> {
  const result = await apiFetch("/api/chat", {
    method: "POST",
    body: { messages, data, today: todayIso(), savedId },
    signal,
    fallbackError: CHAT_ERROR,
  });
  if (!isChatResult(result)) throw new ApiError(CHAT_ERROR);
  return result;
}
