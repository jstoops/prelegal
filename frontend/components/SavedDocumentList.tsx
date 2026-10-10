"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { userMessage } from "@/lib/api";
import { deleteDraft, draftHref, formatUpdated, listDrafts, type DraftSummary } from "@/lib/drafts";
import {
  alertClass,
  cardClass,
  linkClass,
  outlineButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/styles";

const RECENT_COUNT = 3;

interface SavedDocumentListProps {
  /** Catalog names by document id, e.g. "mutual-nda" → "Mutual Non-Disclosure Agreement". */
  documentNames: Record<string, string>;
  /**
   * "all": every document, with delete (My documents).
   * "recent": the latest few with a link to the rest, or nothing if there are none (dashboard).
   */
  variant?: "all" | "recent";
}

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; drafts: DraftSummary[] };

export default function SavedDocumentList({ documentNames, variant = "all" }: SavedDocumentListProps) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const recent = variant === "recent";
  // After a delete the focused button is gone, so focus moves to the list (or
  // the empty state) instead of falling back to the top of the page.
  const refocus = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (listRef.current ?? emptyRef.current)?.focus();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    listDrafts(controller.signal).then(
      (drafts) => setLoad({ status: "loaded", drafts }),
      (error) => {
        if (!controller.signal.aborted) setLoad({ status: "error", message: userMessage(error) });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  const removed = useCallback((id: string) => {
    refocus.current = true;
    setLoad((current) =>
      current.status === "loaded"
        ? { ...current, drafts: current.drafts.filter((d) => d.id !== id) }
        : current,
    );
  }, []);

  // On the dashboard the list is extra, so it only appears once there's something to show.
  if (recent && load.status !== "loaded") return null;

  if (load.status === "loading") {
    return (
      <div role="status" aria-label="Loading your documents" className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={`${cardClass} h-[4.5rem] animate-pulse bg-slate-100/60`} />
        ))}
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div role="alert" className={`${alertClass} flex flex-wrap items-center gap-3`}>
        <span className="flex-1">{load.message}</span>
        <button type="button" onClick={retry} className={secondaryButtonClass}>
          Retry
        </button>
      </div>
    );
  }

  const drafts = recent ? load.drafts.slice(0, RECENT_COUNT) : load.drafts;

  if (drafts.length === 0) {
    if (recent) return null;
    return (
      <div className={`${cardClass} border-dashed px-6 py-14 text-center`}>
        <h2 ref={emptyRef} tabIndex={-1} className="text-base font-semibold text-heading focus:outline-none">
          No documents yet
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-raven">
          Documents you draft with the assistant are saved here automatically, so you can come back to them any time.
        </p>
        <Link href="/app/" className={`${primaryButtonClass} mt-6 inline-block`}>
          Start a new document
        </Link>
      </div>
    );
  }

  const list = (
    <ul
      ref={listRef}
      tabIndex={-1}
      aria-label={recent ? "Recent documents" : "Your documents"}
      className={`${cardClass} divide-y divide-slate-200 focus:outline-none`}
    >
      {drafts.map((draft) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          typeName={documentNames[draft.documentId]}
          onDeleted={recent ? undefined : removed}
        />
      ))}
    </ul>
  );
  if (!recent) return list;
  return (
    <section aria-labelledby="recent-documents">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="recent-documents" className="text-lg font-semibold text-heading">
          Recent documents
        </h2>
        <Link href="/app/documents/" className={`${linkClass} text-sm`}>
          {load.drafts.length > RECENT_COUNT ? `View all ${load.drafts.length}` : "View all"}
        </Link>
      </div>
      {list}
    </section>
  );
}

interface DraftRowProps {
  draft: DraftSummary;
  typeName?: string;
  /** Offers Delete when given. */
  onDeleted?: (id: string) => void;
}

function DraftRow({ draft, typeName, onDeleted }: DraftRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Focus follows the buttons as they swap: to Cancel when asked to confirm,
  // and back to Delete when cancelled or when deleting fails.
  const returnFocus = useRef(false);
  const focusCancel = useCallback((el: HTMLButtonElement | null) => el?.focus(), []);
  const focusDeleteOnReturn = useCallback((el: HTMLButtonElement | null) => {
    if (el && returnFocus.current) {
      returnFocus.current = false;
      el.focus();
    }
  }, []);

  const stopConfirming = () => {
    returnFocus.current = true;
    setConfirming(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteDraft(draft.id);
      onDeleted?.(draft.id);
    } catch (err) {
      setError(userMessage(err));
      setDeleting(false);
      stopConfirming();
    }
  };

  // The title's company names make it longer than the type, which then adds nothing.
  const showType = typeName && !draft.title.startsWith(typeName) ? typeName : null;

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          href={draftHref(draft.id)}
          className="block truncate font-medium text-heading hover:text-brand-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {draft.title}
        </Link>
        <p className="mt-0.5 text-sm text-raven">
          {showType && <>{showType} · </>}
          Edited {formatUpdated(draft.updatedAt)}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-heading">Delete this document?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-70"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button
              ref={focusCancel}
              type="button"
              onClick={stopConfirming}
              disabled={deleting}
              className={`${outlineButtonClass} py-1.5`}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <Link
              href={draftHref(draft.id)}
              aria-label={`Open ${draft.title}`}
              className={`${primaryButtonClass} py-1.5`}
            >
              Open
            </Link>
            {onDeleted && (
              <button
                ref={focusDeleteOnReturn}
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${draft.title}`}
                className={`${outlineButtonClass} py-1.5`}
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
