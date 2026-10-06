#!/usr/bin/env node
/**
 * Generates lib/pdf-fonts/manifest.json and lib/pdf-fonts/coverage.json
 * (minified; don't edit by hand) from the Fontsource packages on jsDelivr.
 *
 * The PDF loads Noto font pieces ("subsets") from jsDelivr on demand. The
 * manifest says which piece covers which characters, and records each file's
 * SHA-256 so the browser can verify it (Subresource Integrity). The coverage
 * table is the union of all pieces, for the form's unsupported-text warning.
 *
 * After changing FONTSOURCE_VERSION or the subsets: npm run gen:fonts
 */
import { writeFile } from "node:fs/promises";
import { filterRanges, mergeRanges, parseRanges } from "./font-ranges.mjs";

const FONTSOURCE_VERSION = "5.3.0";
const CDN = "https://cdn.jsdelivr.net/npm/@fontsource";
const DATA_API = "https://data.jsdelivr.com/v1/packages/npm/@fontsource";

/** Noto Serif subsets, in fallback order (most common first). */
const SERIF_SUBSETS = [
  "latin",
  "latin-ext",
  "cyrillic",
  "cyrillic-ext",
  "greek",
  "greek-ext",
  "vietnamese",
  "math",
];
/** Regular, bold and italic: all the faces the PDF uses. */
const SERIF_VARIANTS = ["400-normal", "700-normal", "400-italic"];
const CJK_PACKAGES = { sc: "noto-sans-sc", jp: "noto-sans-jp", kr: "noto-sans-kr" };
/** CJK fonts have no italic, and the PDF never sets user text in bold. */
const CJK_VARIANTS = ["400-normal"];

/**
 * Characters the CJK fonts should draw. The Noto Sans CJK fonts also contain
 * some Arabic, Devanagari, emoji... glyphs; using those would render part of
 * an unsupported script (unshaped) and hide it from the warning, so the CJK
 * pieces are limited to CJK scripts plus:
 *   U+3000-303F CJK symbols and punctuation   U+3200-33FF enclosed/compatibility
 *   U+FE30-FE4F CJK compatibility forms        U+FF00-FFEF half/full-width forms
 */
const CJK_CHAR =
  /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}　-〿㈀-㏿︰-﹏＀-￯]/u;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** SRI strings ("sha256-...") for every file in a package, by file name. */
async function fileIntegrity(pkg) {
  const { files } = await getJson(`${DATA_API}/${pkg}@${FONTSOURCE_VERSION}?structure=flat`);
  return new Map(files.map((file) => [file.name.split("/").at(-1), `sha256-${file.hash}`]));
}

/** { "400-normal": "sha256-..." } for one subset; fails if a file is missing. */
function subsetFiles(pkg, subset, variants, integrity) {
  return Object.fromEntries(
    variants.map((variant) => {
      const name = `${pkg}-${subset}-${variant}.woff`;
      const hash = integrity.get(name);
      if (!hash) throw new Error(`${pkg}@${FONTSOURCE_VERSION} has no ${name}`);
      return [variant, hash];
    }),
  );
}

async function serifPackage() {
  const pkg = "noto-serif";
  const [unicode, integrity] = await Promise.all([
    getJson(`${CDN}/${pkg}@${FONTSOURCE_VERSION}/unicode.json`),
    fileIntegrity(pkg),
  ]);
  return {
    package: pkg,
    subsets: SERIF_SUBSETS.map((name) => {
      if (!unicode[name]) throw new Error(`${pkg} has no "${name}" subset`);
      return {
        name,
        ranges: parseRanges(unicode[name]),
        files: subsetFiles(pkg, name, SERIF_VARIANTS, integrity),
      };
    }),
  };
}

async function cjkPackage(pkg) {
  const [unicode, integrity] = await Promise.all([
    getJson(`${CDN}/${pkg}@${FONTSOURCE_VERSION}/unicode.json`),
    fileIntegrity(pkg),
  ]);
  // CJK packages split glyphs into numbered pieces, keyed "[0]", "[1]", ...;
  // their named subsets (latin, cyrillic...) duplicate what Noto Serif covers.
  const subsets = Object.entries(unicode)
    .filter(([key]) => /^\[\d+\]$/.test(key))
    .map(([key, range]) => {
      const name = key.slice(1, -1);
      return {
        name,
        ranges: filterRanges(parseRanges(range), (char) => CJK_CHAR.test(char)),
        files: subsetFiles(pkg, name, CJK_VARIANTS, integrity),
      };
    })
    .filter((subset) => subset.ranges.length > 0)
    .sort((a, b) => Number(a.name) - Number(b.name));
  return { package: pkg, subsets };
}

const serif = await serifPackage();
const cjk = Object.fromEntries(
  await Promise.all(
    Object.entries(CJK_PACKAGES).map(async ([lang, pkg]) => [lang, await cjkPackage(pkg)]),
  ),
);

const manifest = { version: FONTSOURCE_VERSION, baseUrl: CDN, serif, cjk };
const allRanges = [serif, ...Object.values(cjk)].flatMap((family) =>
  family.subsets.flatMap((subset) => subset.ranges),
);
const coverage = { version: FONTSOURCE_VERSION, ranges: mergeRanges(allRanges) };

const outDir = new URL("../lib/pdf-fonts/", import.meta.url);
await writeFile(new URL("manifest.json", outDir), JSON.stringify(manifest) + "\n");
await writeFile(new URL("coverage.json", outDir), JSON.stringify(coverage) + "\n");
console.log(
  `Wrote manifest (${serif.subsets.length} serif subsets, ` +
    Object.entries(cjk)
      .map(([lang, f]) => `${f.subsets.length} ${lang}`)
      .join(", ") +
    ` pieces) and coverage (${coverage.ranges.length} ranges).`,
);
