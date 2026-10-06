/**
 * A PDF font file couldn't be downloaded or failed its integrity check.
 * Lives in its own module so the form can `instanceof` it without pulling in
 * the font manifest.
 */
export class FontLoadError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Couldn't load PDF font ${url}`, { cause });
    this.name = "FontLoadError";
  }
}
