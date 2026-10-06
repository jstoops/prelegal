/**
 * Character helpers shared by the font planner and the coverage check. Kept
 * free of the font manifest so the form can use them without loading it.
 */

export type Range = [start: number, end: number];

/** Binary search over sorted, non-overlapping ranges. */
export function inRanges(ranges: Range[], codePoint: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (codePoint < start) hi = mid - 1;
    else if (codePoint > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Characters that need no glyph: control characters (\p{Cc}, e.g. newline,
 * tab), invisible format characters (\p{Cf}, e.g. zero-width joiner U+200D,
 * right-to-left mark U+200F, BOM U+FEFF) and variation selectors U+FE00-FE0F.
 */
const NO_GLYPH = /[\p{Cc}\p{Cf}︀-️]/u;
/** Control characters that separate words: tab, vertical tab, form feed, CR, NEL. */
const SPACING_CONTROLS = /[\t\v\f\r\u0085]/g;

/** Distinct characters that need a glyph, across all texts. */
export function distinctChars(texts: string[]): string[] {
  const chars = new Set<string>();
  for (const text of texts) {
    for (const char of text) {
      if (!NO_GLYPH.test(char)) chars.add(char);
    }
  }
  return [...chars];
}

/**
 * Prepares user text for the PDF: react-pdf drops tabs (and similar spacing
 * controls) entirely, which would run words together ("Joint⇥venture" ->
 * "Jointventure"), so they become spaces. Newlines are kept; invisible
 * characters such as joiners are already dropped harmlessly by react-pdf.
 */
export function toPdfText(text: string): string {
  return text.replace(SPACING_CONTROLS, " ");
}
