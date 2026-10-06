import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

// PDF fonts are fetched from jsDelivr, so these tests need network access.
const FONT_CDN = "https://cdn.jsdelivr.net/npm/@fontsource/";

const party = (page: Page, n: 1 | 2) => page.getByRole("group", { name: `Party ${n}` });

/** Records every font file the page requests from the CDN. */
function trackFontRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().startsWith(FONT_CDN)) urls.push(req.url());
  });
  return urls;
}

async function downloadPdfText(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect(await download.failure()).toBeNull();
  const bytes = new Uint8Array(await readFile(await download.path()));
  const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
  return text.replace(/\s+/g, " ");
}

const fileName = (url: string) => url.split("/").at(-1)!;

test("draws non-Latin scripts in the downloaded PDF", async ({ page }) => {
  const fonts = trackFontRequests(page);
  await page.goto("/");
  await page.getByLabel("Purpose").fill("Сотрудничество — Έρευνα και ανάπτυξη");
  await page.getByLabel("Jurisdiction").fill("Thành phố Hồ Chí Minh");
  await page.getByLabel("MNDA modifications").fill("Zażółć gęślą jaźń; Dvořák");
  await party(page, 1).getByLabel("Company").fill("株式会社さくら");
  await party(page, 1).getByLabel("Signer name").fill("山田 太郎");
  await party(page, 2).getByLabel("Company").fill("李明 有限公司");
  await party(page, 2).getByLabel("Signer name").fill("김민준");
  await expect(page.getByText(/won't appear in the PDF/)).toBeHidden();

  const text = await downloadPdfText(page);
  for (const expected of [
    "Сотрудничество — Έρευνα και ανάπτυξη",
    "Thành phố Hồ Chí Minh",
    "Zażółć gęślą jaźń; Dvořák",
    "株式会社さくら",
    "山田 太郎",
    "李明 有限公司",
    "김민준",
  ]) {
    expect(text).toContain(expected);
  }

  const files = fonts.map(fileName);
  for (const subset of ["latin", "latin-ext", "cyrillic", "greek", "vietnamese"]) {
    expect(files).toContain(`noto-serif-${subset}-400-normal.woff`);
  }
  expect(files.some((f) => f.startsWith("noto-sans-jp-"))).toBe(true);
  expect(files.some((f) => f.startsWith("noto-sans-kr-"))).toBe(true);
  // Only a handful of the ~330 CJK pieces are needed.
  expect(new Set(files.filter((f) => f.startsWith("noto-sans-"))).size).toBeLessThan(25);
});

test("loads only the Noto Serif latin piece for a Latin-only NDA", async ({ page }) => {
  const fonts = trackFontRequests(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(fonts).toEqual([]); // nothing until the user downloads

  await party(page, 1).getByLabel("Company").fill("Müller & Söhne GmbH");
  const text = await downloadPdfText(page);
  expect(text).toContain("Müller & Söhne GmbH");
  expect(text).toContain("Confidential Information");
  // Each file is fetched once (react-pdf gets the verified bytes, not the URL).
  expect(fonts.map(fileName).sort()).toEqual([
    "noto-serif-latin-400-italic.woff",
    "noto-serif-latin-400-normal.woff",
    "noto-serif-latin-700-normal.woff",
  ]);

  // A second download reuses the fonts already loaded.
  await downloadPdfText(page);
  expect(fonts).toHaveLength(3);
});

test("requests fonts without a Referer or cookies", async ({ page }) => {
  const sent: Promise<Record<string, string>>[] = [];
  page.on("request", (req) => {
    if (req.url().startsWith(FONT_CDN)) sent.push(req.allHeaders());
  });
  await page.goto("/?case=secret-client-name");
  await downloadPdfText(page);
  const headers = await Promise.all(sent);
  expect(headers.length).toBeGreaterThan(0);
  for (const h of headers) {
    expect(h.referer ?? "").toBe(""); // Chromium may report an absent Referer as ""
    expect(h.cookie).toBeUndefined();
  }
});

test("rejects a font file that doesn't match its integrity hash", async ({ page, context }) => {
  await context.route(`${FONT_CDN}**`, async (route) => {
    const response = await route.fetch();
    const body = Buffer.from(await response.body());
    body[body.length - 1] ^= 0xff; // tamper with one byte
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Couldn't download the PDF fonts. Check your connection and try again.",
  );
});

test("explains when the fonts can't be downloaded, and recovers", async ({ page, context }) => {
  await context.route(`${FONT_CDN}**`, (route) => route.abort("internetdisconnected"));
  await page.goto("/");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Couldn't download the PDF fonts. Check your connection and try again.",
  );
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();

  await context.unroute(`${FONT_CDN}**`);
  const text = await downloadPdfText(page);
  expect(text).toContain("Mutual Non-Disclosure Agreement");
  await expect(page.getByRole("status")).toBeEmpty();
});

test("warns about characters that can't be included, without blocking download", async ({ page }) => {
  await page.goto("/");
  await party(page, 2).getByLabel("Company").fill("شركة الأمل");
  const note = page.getByText(/won't appear in the PDF/);
  await expect(note).toContainText("These characters won't appear in the PDF:");
  await expect(note).toContainText("ش");
  await expect(note).toBeVisible();
  // Announced politely to screen readers.
  await expect(page.locator('[aria-live="polite"]')).toContainText("won't appear in the PDF");

  // The header grew, but on desktop it still doesn't cover the form or preview.
  const headerBottom = (await page.locator("header").boundingBox())!;
  const formTop = (await page.locator("aside").boundingBox())!;
  const previewTop = (await page.getByRole("region", { name: "NDA preview" }).boundingBox())!;
  expect(formTop.y).toBeGreaterThanOrEqual(headerBottom.y + headerBottom.height);
  expect(previewTop.y).toBeGreaterThanOrEqual(headerBottom.y + headerBottom.height);

  await downloadPdfText(page); // still downloads
  await party(page, 2).getByLabel("Company").fill("Globex LLC");
  await expect(note).toBeHidden();
});

test("only loads the character coverage table for non-Latin text", async ({ page }) => {
  const coverageChunks: string[] = [];
  page.on("response", async (res) => {
    if (res.url().endsWith(".js") && (await res.text()).includes('"ranges":[[')) {
      coverageChunks.push(res.url());
    }
  });
  await page.goto("/");
  await page.getByLabel("Governing law").fill("Delaware, Müller");
  await page.waitForLoadState("networkidle");
  expect(coverageChunks).toEqual([]);

  await page.getByLabel("Governing law").fill("Ελλάδα");
  await expect.poll(() => coverageChunks.length).toBeGreaterThan(0);
});
