/**
 * Unicode range helpers shared by generate-font-manifest.mjs and its tests.
 * A range is [start, end] (inclusive code points); lists are kept sorted,
 * non-overlapping and merged so lib/pdf-fonts can binary-search them.
 */

/**
 * @param {[number, number][]} ranges
 * @returns {[number, number][]}
 */
export function mergeRanges(ranges) {
  const sorted = ranges.map(([start, end]) => [start, end]).sort((a, b) => a[0] - b[0]);
  /** @type {[number, number][]} */
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Parses a CSS unicode-range ("U+0000-00FF,U+0131") into merged ranges.
 * @param {string} unicodeRange
 * @returns {[number, number][]}
 */
export function parseRanges(unicodeRange) {
  return mergeRanges(
    unicodeRange.split(",").map((part) => {
      const [start, end = start] = part.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(start, 16), parseInt(end, 16)];
    }),
  );
}

/**
 * Keeps only the code points for which `keep(char)` is true.
 * @param {[number, number][]} ranges
 * @param {(char: string) => boolean} keep
 * @returns {[number, number][]}
 */
export function filterRanges(ranges, keep) {
  /** @type {[number, number][]} */
  const kept = [];
  for (const [start, end] of ranges) {
    for (let cp = start; cp <= end; cp++) {
      if (!keep(String.fromCodePoint(cp))) continue;
      const last = kept.at(-1);
      if (last && last[1] === cp - 1) last[1] = cp;
      else kept.push([cp, cp]);
    }
  }
  return kept;
}
