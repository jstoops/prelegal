import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { distinctChars, inRanges, toPdfText, type Range } from "@/lib/pdf-fonts/chars";
import { findUnsupportedChars } from "@/lib/pdf-fonts/coverage";
import coverage from "@/lib/pdf-fonts/coverage.json";
import { FontLoadError } from "@/lib/pdf-fonts/errors";
import { cjkPreference, planFonts, type PdfFont } from "@/lib/pdf-fonts";
import manifest from "@/lib/pdf-fonts/manifest.json";
import { mergeRanges } from "../../scripts/font-ranges.mjs";

const families = (texts: string[]) => planFonts(texts).fonts.map((f) => f.family);
const CDN = "https://cdn.jsdelivr.net/npm/@fontsource";
const SRI = /^sha256-[A-Za-z0-9+/]{43}=$/;

// Invisible characters, spelled out so editors can't silently drop them.
const ZWJ = "‍";
const VS16 = "️";
const RLM = "‏";
const BOM = "﻿";
const SOFT_HYPHEN = "­";

describe("inRanges", () => {
  const ranges: Range[] = [
    [10, 20],
    [30, 30],
    [40, 50],
  ];
  it.each([10, 15, 20, 30, 40, 50])("finds %d", (cp) => expect(inRanges(ranges, cp)).toBe(true));
  it.each([0, 9, 21, 29, 31, 39, 51, 1000])("rejects %d", (cp) =>
    expect(inRanges(ranges, cp)).toBe(false),
  );
  it("handles an empty list", () => expect(inRanges([], 5)).toBe(false));
});

describe("distinctChars", () => {
  it("returns each character once, across texts", () => {
    expect(distinctChars(["abca", "bd"])).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps surrogate pairs (e.g. rare CJK, emoji) as single characters", () => {
    expect(distinctChars(["𠮷😀"])).toEqual(["𠮷", "😀"]);
  });

  it("ignores characters that need no glyph", () => {
    expect(distinctChars([`a\n\tb${ZWJ}${VS16}${RLM}${BOM}${SOFT_HYPHEN}c`])).toEqual(["a", "b", "c"]);
  });
});

describe("toPdfText", () => {
  it("turns tabs and other spacing controls into spaces", () => {
    expect(toPdfText("Name:\tAcme\rInc\u000Bx\u000Cy\u0085z")).toBe("Name: Acme Inc x y z");
  });

  it("leaves invisible characters alone (react-pdf drops them harmlessly)", () => {
    const text = `™${VS16} a${ZWJ}b${RLM}c${BOM}d${SOFT_HYPHEN}e`;
    expect(toPdfText(text)).toBe(text);
  });

  it("keeps newlines", () => {
    expect(toPdfText("line one\nline two")).toBe("line one\nline two");
  });

  it("keeps real spaces that fonts can draw (no-break, ideographic)", () => {
    expect(toPdfText("10 days　東京")).toBe("10 days　東京");
  });

  it("leaves ordinary text unchanged", () => {
    const text = "Müller — 株式会社さくら, Сотрудничество (Έρευνα)";
    expect(toPdfText(text)).toBe(text);
  });
});

describe("manifest", () => {
  const allSubsets = [
    ...manifest.serif.subsets,
    ...Object.values(manifest.cjk).flatMap((f) => f.subsets),
  ];

  it("is pinned to a Fontsource version on jsDelivr", () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.baseUrl).toBe(CDN);
  });

  it("lists Noto Serif subsets with Latin first", () => {
    expect(manifest.serif.package).toBe("noto-serif");
    expect(manifest.serif.subsets[0].name).toBe("latin");
  });

  it("has numbered CJK pieces for Chinese, Japanese and Korean", () => {
    expect(Object.keys(manifest.cjk).sort()).toEqual(["jp", "kr", "sc"]);
    for (const { subsets } of Object.values(manifest.cjk)) {
      expect(subsets.length).toBeGreaterThan(0);
      for (const subset of subsets) expect(subset.name).toMatch(/^\d+$/);
    }
  });

  it("records an SRI hash for every font file the PDF can use", () => {
    for (const subset of manifest.serif.subsets) {
      expect(Object.keys(subset.files).sort()).toEqual(["400-italic", "400-normal", "700-normal"]);
    }
    for (const subset of Object.values(manifest.cjk).flatMap((f) => f.subsets)) {
      expect(Object.keys(subset.files)).toEqual(["400-normal"]);
    }
    for (const subset of allSubsets) {
      for (const hash of Object.values(subset.files)) expect(hash).toMatch(SRI);
    }
  });

  it("stores sorted, non-overlapping, merged ranges", () => {
    for (const { ranges } of [...allSubsets, coverage]) {
      for (let i = 0; i < ranges.length; i++) {
        const [start, end] = ranges[i];
        expect(start).toBeLessThanOrEqual(end);
        if (i > 0) expect(start).toBeGreaterThan(ranges[i - 1][1] + 1);
      }
    }
  });

  it("has a coverage table exactly equal to the union of every subset", () => {
    expect(coverage.version).toBe(manifest.version);
    const union = mergeRanges(allSubsets.flatMap((s) => s.ranges as [number, number][]));
    expect(coverage.ranges).toEqual(union);
  });

  it("never uses the CJK fonts for non-CJK scripts", () => {
    for (const { subsets } of Object.values(manifest.cjk)) {
      for (const subset of subsets) {
        for (const char of ["ا", "न", "ก", "א", "😀", "A", "Ж"]) {
          expect(inRanges(subset.ranges as Range[], char.codePointAt(0)!)).toBe(false);
        }
      }
    }
  });
});

describe("cjkPreference", () => {
  it.each([
    ["株式会社さくら", "jp"],
    ["カタカナ", "jp"],
    ["김민준", "kr"],
    ["李明有限公司", "sc"],
    ["Acme", "sc"],
  ])("prefers the right language for %s", (text, lang) => {
    expect(cjkPreference(text)[0]).toBe(lang);
  });

  it("always lists all three languages", () => {
    for (const text of ["さ", "김", "李", ""]) {
      expect([...cjkPreference(text)].sort()).toEqual(["jp", "kr", "sc"]);
    }
  });
});

describe("planFonts", () => {
  it("always includes the Noto Serif latin piece, even for empty text", () => {
    expect(families([])).toEqual(["noto-serif-latin"]);
    expect(families(["Acme, Inc. — “Confidential” §5 €100 ½ ©"])).toEqual(["noto-serif-latin"]);
  });

  it("covers Western European accents with the latin piece", () => {
    expect(families(["Müller, Café, Ñandú, Ærøskøbing, Œuvre"])).toEqual(["noto-serif-latin"]);
  });

  it.each([
    ["Polish", "Łukasz Żółć", "noto-serif-latin-ext"],
    ["Czech", "Dvořák", "noto-serif-latin-ext"],
    ["Turkish", "Ağaoğlu", "noto-serif-latin-ext"],
    ["Russian", "Сотрудничество", "noto-serif-cyrillic"],
    ["Greek", "Έρευνα", "noto-serif-greek"],
    ["Vietnamese", "Hồ Chí Minh", "noto-serif-vietnamese"],
    ["Math", "∑ ∫ ≠", "noto-serif-math"],
  ])("adds the right Noto Serif piece for %s", (_name, text, family) => {
    expect(families([text])).toEqual(["noto-serif-latin", family]);
  });

  it("adds only the CJK pieces needed, using the preferred language", () => {
    const jp = families(["株式会社さくら"]);
    expect(jp[0]).toBe("noto-serif-latin");
    expect(jp.slice(1).every((f) => f.startsWith("noto-sans-jp-"))).toBe(true);
    expect(jp.length).toBeLessThan(8);

    expect(families(["김민준"]).slice(1).every((f) => f.startsWith("noto-sans-kr-"))).toBe(true);
    expect(families(["李明有限公司"]).slice(1).every((f) => f.startsWith("noto-sans-sc-"))).toBe(true);
  });

  it("falls back to another CJK font for characters the preferred one lacks", () => {
    // Hangul puts Korean first, but kana aren't in the Korean font.
    const mixed = families(["김민준 さくら"]);
    expect(mixed.some((f) => f.startsWith("noto-sans-kr-"))).toBe(true);
    expect(mixed.some((f) => f.startsWith("noto-sans-jp-"))).toBe(true);
  });

  it("lists fonts in a stable order: Noto Serif pieces, then CJK by preference", () => {
    const fonts = families(["김민준", "Σ", "Ж", "Ł"]);
    expect(fonts.slice(0, 4)).toEqual([
      "noto-serif-latin",
      "noto-serif-latin-ext",
      "noto-serif-cyrillic",
      "noto-serif-greek",
    ]);
    expect(fonts.slice(4).every((f) => f.startsWith("noto-sans-kr-"))).toBe(true);
    expect(families(["Σ", "Ж", "Ł", "김민준"])).toEqual(fonts);
  });

  it.each([
    ["Arabic", "مرحبا", ["م", "ر", "ح", "ب", "ا"]],
    ["Hebrew", "שלום", ["ש", "ל", "ו", "ם"]],
    ["Thai", "สวัสดี", ["ส", "ว", "ั", "ด", "ี"]],
    ["Devanagari", "नमस्ते", ["न", "म", "स", "्", "त", "े"]],
    ["emoji", "Deal 🤝", ["🤝"]],
  ])("reports %s as unsupported, without partly drawing it", (_name, text, chars) => {
    const plan = planFonts([`Acme ${text}`]);
    expect(plan.unsupported).toEqual(chars);
    expect(plan.fonts.map((f) => f.family)).toEqual(["noto-serif-latin"]);
  });

  it("builds verified jsDelivr files for regular, bold and italic Noto Serif", () => {
    const [latin] = planFonts([]).fonts;
    const base = `${CDN}/noto-serif@${manifest.version}/files/noto-serif-latin`;
    const hashes = manifest.serif.subsets[0].files;
    expect(latin.files).toEqual([
      { url: `${base}-400-normal.woff`, integrity: hashes["400-normal"], fontWeight: 400 },
      { url: `${base}-700-normal.woff`, integrity: hashes["700-normal"], fontWeight: 700 },
      { url: `${base}-400-italic.woff`, integrity: hashes["400-italic"], fontStyle: "italic" },
    ]);
  });

  it("registers the regular CJK face for italic too (CJK fonts have no italic)", () => {
    const cjk = planFonts(["김"]).fonts.at(-1)!;
    expect(cjk.family).toMatch(/^noto-sans-kr-\d+$/);
    const piece = cjk.family.replace("noto-sans-kr-", "");
    const url = `${CDN}/noto-sans-kr@${manifest.version}/files/noto-sans-kr-${piece}-400-normal.woff`;
    const [regular, italic] = cjk.files;
    expect(regular).toMatchObject({ url, fontWeight: 400 });
    expect(italic).toMatchObject({ url, fontStyle: "italic" });
    expect(regular.integrity).toMatch(SRI);
    expect(italic.integrity).toBe(regular.integrity);
  });
});

describe("findUnsupportedChars", () => {
  it("returns nothing for Latin-1 text", async () => {
    expect(await findUnsupportedChars("Acme, Inc. Müller ©")).toEqual([]);
  });

  it("returns nothing for supported scripts", async () => {
    expect(
      await findUnsupportedChars("Łukasz Сотрудничество Έρευνα Hồ 株式会社さくら 김민준 李明"),
    ).toEqual([]);
  });

  it("lists unsupported characters once each, in order of appearance", async () => {
    expect(await findUnsupportedChars("Acme مرحبا\nمر שלום")).toEqual([
      "م",
      "ر",
      "ح",
      "ب",
      "ا",
      "ש",
      "ל",
      "ו",
      "ם",
    ]);
  });

  it("ignores characters that need no glyph", async () => {
    expect(await findUnsupportedChars(`™${VS16} a${ZWJ}b`)).toEqual([]);
  });

  it("agrees with planFonts on what is unsupported", async () => {
    const texts = ["Łukasz", "김민준", "مرحبا", "สวัสดี", "😀", "株式会社"];
    expect(await findUnsupportedChars(texts.join("\n"))).toEqual(planFonts(texts).unsupported);
  });
});

describe("loadPdfFonts", () => {
  const register = vi.fn();
  const font = (family: string, ...urls: string[]): PdfFont => ({
    family,
    files: urls.map((url) => ({ url, integrity: `sha256-${family}`, fontWeight: 400 })),
  });

  // Fresh modules per test: the loader caches downloads and registrations.
  // (FontLoadError must then come from the same fresh module graph.)
  let FreshFontLoadError: typeof FontLoadError;
  async function importLoader() {
    vi.resetModules();
    vi.doMock("@react-pdf/renderer", () => ({ Font: { register } }));
    FreshFontLoadError = (await import("@/lib/pdf-fonts/errors")).FontLoadError;
    return (await import("@/lib/pdf-fonts/load")).loadPdfFonts;
  }

  beforeEach(() => register.mockClear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@react-pdf/renderer");
  });

  it("fetches each file once, verified, without cookies or referrer", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(new Uint8Array([1, 2, 3])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const loadPdfFonts = await importLoader();

    const stack = await loadPdfFonts([
      font("a", "https://cdn/a.woff", "https://cdn/shared.woff"),
      font("b", "https://cdn/shared.woff"),
    ]);

    expect(stack).toEqual(["a", "b"]);
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      "https://cdn/a.woff",
      "https://cdn/shared.woff",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
      expect(init?.integrity).toMatch(/^sha256-/);
    }
  });

  it("registers the verified bytes as data URLs, never the CDN URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]))));
    const loadPdfFonts = await importLoader();
    await loadPdfFonts([font("a", "https://cdn/a.woff")]);
    expect(register).toHaveBeenCalledWith({
      family: "a",
      fonts: [{ src: "data:font/woff;base64,d09GRg==", fontWeight: 400, fontStyle: undefined }],
    });
  });

  it("downloads and registers each family only once per session", async () => {
    const fetchMock = vi.fn(async () => new Response("x"));
    vi.stubGlobal("fetch", fetchMock);
    const loadPdfFonts = await importLoader();
    await loadPdfFonts([font("a", "https://cdn/a.woff")]);
    await loadPdfFonts([font("a", "https://cdn/a.woff")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("throws FontLoadError on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    const loadPdfFonts = await importLoader();
    const error = await loadPdfFonts([font("a", "https://cdn/missing.woff")]).catch((e) => e);
    expect(error).toBeInstanceOf(FreshFontLoadError);
    expect(error.message).toContain("https://cdn/missing.woff");
    expect(error.cause.message).toBe("HTTP 404");
    expect(register).not.toHaveBeenCalled();
  });

  it("throws FontLoadError when the network or integrity check fails, and retries later", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("x"));
    vi.stubGlobal("fetch", fetchMock);
    const loadPdfFonts = await importLoader();
    await expect(loadPdfFonts([font("a", "https://cdn/a.woff")])).rejects.toBeInstanceOf(
      FreshFontLoadError,
    );
    await expect(loadPdfFonts([font("a", "https://cdn/a.woff")])).resolves.toEqual(["a"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an empty plan", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const loadPdfFonts = await importLoader();
    expect(await loadPdfFonts([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
