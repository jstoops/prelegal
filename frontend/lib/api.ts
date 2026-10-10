/**
 * JSON client for the backend API. Requests carry the session cookie (same
 * origin), and failures become an `ApiError` with a message that can be shown
 * to the user.
 */

const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again.";
/** Prefix pydantic adds to messages from the backend's own validators. */
const VALUE_ERROR = "Value error, ";

/** A failed request, with a message that can be shown to the user. */
export class ApiError extends Error {
  name = "ApiError";
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** What to tell the user about a failure: an `ApiError`'s message, or a generic one. */
export const userMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : GENERIC_ERROR;

let onUnauthorized: () => void = () => {};

/**
 * Called when a request is refused because the session ended (expired, or
 * signed out in another tab). The auth provider uses it to sign the user out.
 */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const { detail } = await response.json();
    if (typeof detail === "string") return detail;
    // Validation errors are a list. Only the backend's own validators write
    // messages meant for users (e.g. "Enter a valid email address.").
    const message = Array.isArray(detail) ? detail[0]?.msg : undefined;
    if (typeof message === "string" && message.startsWith(VALUE_ERROR)) {
      return message.slice(VALUE_ERROR.length);
    }
  } catch {
    // Not JSON, e.g. a proxy error page.
  }
  return fallback;
}

export interface ApiOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Shown when the server gives no usable message. */
  fallbackError?: string;
  /**
   * Whether a 401 means the session ended. False where it's an expected
   * answer, e.g. a wrong password.
   */
  sessionRequired?: boolean;
}

/** Makes a request; resolves to the parsed JSON body (undefined if there is none). */
export async function apiFetch(path: string, options: ApiOptions = {}): Promise<unknown> {
  const { method = "GET", body, signal, fallbackError = GENERIC_ERROR, sessionRequired = true } = options;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(NETWORK_ERROR);
  }
  if (!response.ok) {
    if (response.status === 401 && sessionRequired) onUnauthorized();
    throw new ApiError(await errorMessage(response, fallbackError), response.status);
  }
  if (response.status === 204) return undefined;
  return response.json().catch(() => {
    throw new ApiError(fallbackError, response.status);
  });
}
