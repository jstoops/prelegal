/**
 * Downloads, verifies and registers PDF fonts with react-pdf.
 *
 * Each file is fetched once, from jsDelivr, with Subresource Integrity (the
 * browser rejects anything that doesn't match the manifest's SHA-256), no
 * cookies and no Referer. The verified bytes are handed to react-pdf as a
 * data URL, so it never fetches the CDN itself. Results are cached for the
 * session, so later downloads reuse them.
 */
import { Font } from "@react-pdf/renderer";
import { FontLoadError } from "./errors";
import type { FontFile, PdfFont } from "./index";

const dataUrls = new Map<string, Promise<string>>();
const registered = new Set<string>();

function toDataUrl(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return `data:font/woff;base64,${btoa(binary)}`;
}

async function download({ url, integrity }: FontFile): Promise<string> {
  try {
    const res = await fetch(url, {
      integrity,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return toDataUrl(await res.arrayBuffer());
  } catch (error) {
    throw new FontLoadError(url, error);
  }
}

function fontDataUrl(file: FontFile): Promise<string> {
  let pending = dataUrls.get(file.url);
  if (!pending) {
    pending = download(file);
    // Forget failures so a retry downloads again.
    pending.catch(() => dataUrls.delete(file.url));
    dataUrls.set(file.url, pending);
  }
  return pending;
}

/**
 * Makes `fonts` available to react-pdf; returns their family names, in order,
 * for use as a fontFamily stack. Throws FontLoadError if any file fails.
 */
export async function loadPdfFonts(fonts: PdfFont[]): Promise<string[]> {
  await Promise.all(
    fonts
      .filter((font) => !registered.has(font.family))
      .map(async ({ family, files }) => {
        const sources = await Promise.all(
          files.map(async (file) => ({
            src: await fontDataUrl(file),
            fontWeight: file.fontWeight,
            fontStyle: file.fontStyle,
          })),
        );
        Font.register({ family, fonts: sources });
        registered.add(family);
      }),
  );
  return fonts.map((font) => font.family);
}
