/**
 * Client for the backend's AI chat (`POST /api/chat`). The backend is
 * stateless: each turn sends the whole conversation and the current NDA, and
 * gets back the assistant's reply and the NDA with its updates applied.
 */

import { todayIso, type NdaData } from "@/lib/nda";

/** Longest message the backend accepts (`MAX_MESSAGE_LENGTH` in backend nda.py). */
export const MAX_MESSAGE_LENGTH = 4000;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  data: NdaData;
}

/** A failed chat turn, with a message that can be shown to the user. */
export class ChatError extends Error {
  name = "ChatError";
}

const GENERIC_ERROR = "The AI assistant is unavailable. Please try again.";
const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    // FastAPI validation errors have a list here, not a message.
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Not JSON, e.g. a proxy error page.
  }
  return GENERIC_ERROR;
}

function isChatResult(value: unknown): value is ChatResult {
  const result = value as ChatResult | null;
  return typeof result?.reply === "string" && result.data?.parties?.length === 2;
}

/** Sends one chat turn. Pass an empty `messages` to get the opening greeting. */
export async function sendChat(
  messages: ChatMessage[],
  data: NdaData,
  signal?: AbortSignal,
): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, data, today: todayIso() }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ChatError(NETWORK_ERROR);
  }
  if (!response.ok) throw new ChatError(await errorDetail(response));
  const result: unknown = await response.json().catch(() => null);
  if (!isChatResult(result)) throw new ChatError(GENERIC_ERROR);
  return result;
}
