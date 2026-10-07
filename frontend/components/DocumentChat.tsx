"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChatError, MAX_MESSAGE_LENGTH, sendChat, type ChatMessage } from "@/lib/chat";
import type { DocumentData } from "@/lib/document";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/styles";

interface DocumentChatProps {
  /** The document as the assistant should see it (empty dates mean today). */
  data: DocumentData;
  /** Receives the document with the assistant's updates after each reply. */
  onDataChange: (data: DocumentData) => void;
}

const FALLBACK_ERROR = "Something went wrong. Please try again.";

/**
 * Freeform chat with the AI assistant, which works out which document the user
 * needs and fills it in. The conversation lives here and is lost on reload; the
 * document itself is owned by the parent.
 */
export default function DocumentChat({ data, onDataChange }: DocumentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Starts pending: the assistant's greeting is requested on mount.
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const inputId = useId();
  const logRef = useRef<HTMLDivElement>(null);

  // Turns read the latest document without restarting the greeting effect.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const runTurn = useCallback(
    async (history: ChatMessage[], signal?: AbortSignal) => {
      try {
        const result = await sendChat(history, dataRef.current, signal);
        setMessages([...history, { role: "assistant", content: result.reply }]);
        onDataChange(result.data);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof ChatError ? err.message : FALLBACK_ERROR);
      }
      setPending(false);
    },
    [onDataChange],
  );

  useEffect(() => {
    // Aborted on unmount, so React's dev-mode double effect greets only once.
    const controller = new AbortController();
    void runTurn([], controller.signal);
    return () => controller.abort();
  }, [runTurn]);

  // Keep the newest message in view, scrolling only the conversation itself.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, pending, error]);

  const startTurn = (history: ChatMessage[]) => {
    setMessages(history);
    setError(null);
    setPending(true);
    void runTurn(history);
  };

  const send = () => {
    const content = input.trim();
    if (!content || pending) return;
    setInput("");
    startTurn([...messages, { role: "user", content }]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a new line. Don't send mid-IME composition.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-[28rem] min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm lg:h-full">
      <div
        ref={logRef}
        role="log"
        aria-label="Conversation with the assistant"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              message.role === "user"
                ? "self-end bg-brand-strong text-white"
                : "self-start bg-slate-100 text-slate-900"
            }`}
          >
            <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
            <span>{message.content}</span>
          </div>
        ))}
        {pending && (
          <p className="self-start animate-pulse text-sm text-slate-600">Assistant is typing…</p>
        )}
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => startTurn(messages)}
              className={secondaryButtonClass}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 p-3">
        <label htmlFor={inputId} className="sr-only">
          Message the assistant
        </label>
        <textarea
          id={inputId}
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message…"
          maxLength={MAX_MESSAGE_LENGTH}
          className={`${inputClass} resize-none`}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Send
        </button>
      </form>
    </div>
  );
}
