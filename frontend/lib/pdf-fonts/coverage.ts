/**
 * Finds characters the PDF can't draw, for the live warning in the form.
 *
 * Kept separate from planFonts() (and its 350 KB manifest) so the form can
 * check text cheaply: the coverage table (generated alongside the manifest)
 * is only fetched once text contains something beyond Latin-1.
 */
import { useEffect, useState } from "react";
import { distinctChars, inRanges, type Range } from "./chars";

/**
 * Noto Serif "latin" covers all of U+0000-00FF. (Control characters in that
 * range never reach this check: distinctChars drops them.)
 */
const isLatin1 = (char: string) => char.codePointAt(0)! <= 0xff;

export async function findUnsupportedChars(text: string): Promise<string[]> {
  const candidates = distinctChars([text]).filter((char) => !isLatin1(char));
  if (candidates.length === 0) return [];
  const { default: coverage } = await import("./coverage.json");
  const ranges = coverage.ranges as Range[];
  return candidates.filter((char) => !inRanges(ranges, char.codePointAt(0)!));
}

/**
 * Characters in `text` the PDF can't draw, updated as the text changes. If
 * the check itself fails (e.g. the coverage chunk can't load offline), it
 * reports nothing rather than a stale or misleading list.
 */
export function useUnsupportedChars(text: string): string[] {
  const [unsupported, setUnsupported] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    const update = (chars: string[]) => {
      if (!current) return;
      // Keep the same array when nothing changed, to avoid re-rendering.
      setUnsupported((prev) => (prev.join("") === chars.join("") ? prev : chars));
    };
    findUnsupportedChars(text).then(update, () => update([]));
    return () => {
      current = false;
    };
  }, [text]);
  return unsupported;
}
