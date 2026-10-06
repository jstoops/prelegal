import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

const FIXED_NOW = new Date("2026-10-05T15:00:00-04:00"); // Oct 5, 2026 in New York

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

const preview = (page: Page) => page.getByRole("region", { name: "NDA preview" });
const party = (page: Page, n: 1 | 2) => page.getByRole("group", { name: `Party ${n}` });

async function fillForm(page: Page) {
  await page.getByLabel("Purpose").fill("Exploring a joint go-to-market partnership.");
  await page.getByLabel("Effective date").fill("2027-01-15");
  await page.getByLabel("Until terminated").check();
  const confYears = page.getByLabel("Term of confidentiality in years");
  await confYears.fill("3");
  await page.getByLabel("Governing law").fill("Delaware");
  await page.getByLabel("Jurisdiction").fill("New Castle, DE");
  await page.getByLabel("MNDA modifications").fill("Retention limited to 90 days.");
  const parties = [
    { company: "Acme, Inc.", name: "Jane Doe", title: "CEO", address: "legal@acme.com" },
    { company: "Globex LLC", name: "John Roe", title: "CTO", address: "1 Main St, Springfield" },
  ];
  for (const [i, p] of parties.entries()) {
    const group = party(page, (i + 1) as 1 | 2);
    await group.getByLabel("Company").fill(p.company);
    await group.getByLabel("Signer name").fill(p.name);
    await group.getByLabel("Title").fill(p.title);
    await group.getByLabel("Notice address").fill(p.address);
  }
}

async function downloadPdf(page: Page): Promise<{ download: Download; text: string; pages: string[] }> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const bytes = new Uint8Array(await readFile(path));
  expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  const pdf = await getDocumentProxy(bytes);
  const { text: pages } = await extractText(pdf, { mergePages: false });
  return { download, pages, text: pages.join("\n").replace(/\s+/g, " ") };
}

test.describe("page load", () => {
  test("renders without console errors or hydration warnings", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") problems.push(msg.text());
    });
    page.on("pageerror", (err) => problems.push(err.message));

    await page.goto("/");
    await expect(page).toHaveTitle("Mutual NDA Creator | Prelegal");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mutual NDA Creator");
    await expect(preview(page).getByRole("heading", { name: "Standard Terms" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("defaults the effective date to today in the browser's time zone", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Effective date")).toHaveValue("2026-10-05");
    await expect(preview(page).getByText("October 5, 2026")).toBeVisible();
  });

  test("passes an automated accessibility scan (WCAG 2.1 AA)", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe("form and live preview", () => {
  test("reflects every field in the preview", async ({ page }) => {
    await page.goto("/");
    await fillForm(page);
    const doc = preview(page);
    await expect(doc.getByText("Exploring a joint go-to-market partnership.")).toBeVisible();
    await expect(doc.getByText("January 15, 2027")).toBeVisible();
    await expect(doc.getByText(/☒\s*Continues until terminated/)).toBeVisible();
    await expect(doc.getByText(/3 years from Effective Date/)).toBeVisible();
    await expect(doc.getByText("Governing Law: Delaware")).toBeVisible();
    await expect(doc.getByText("Jurisdiction: New Castle, DE")).toBeVisible();
    await expect(doc.getByText("Retention limited to 90 days.")).toBeVisible();
    const row = (label: string) => doc.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label }) });
    await expect(row("Company").getByRole("cell")).toHaveText(["Acme, Inc.", "Globex LLC"]);
    await expect(row("Print Name").getByRole("cell")).toHaveText(["Jane Doe", "John Roe"]);
  });

  test("lets the user clear the effective date without it snapping back", async ({ page }) => {
    await page.goto("/");
    const date = page.getByLabel("Effective date");
    await date.fill("");
    await expect(date).toHaveValue("");
    await expect(preview(page).getByText("[Effective Date]")).toBeVisible();
    await page.getByLabel("Governing law").fill("Delaware");
    await expect(date).toHaveValue("");
  });

  test("validates the years input as the user types", async ({ page }) => {
    await page.goto("/");
    const years = page.getByLabel("MNDA term in years");
    await years.fill("");
    await years.pressSequentially("12");
    await expect(preview(page).getByText("Expires 12 years from Effective Date.")).toBeVisible();

    await years.fill("500");
    await expect(page.getByText("Enter a whole number from 1 to 99.")).toBeVisible();
    await expect(years).toHaveAttribute("aria-invalid", "true");
    await expect(preview(page).getByText("Expires 12 years from Effective Date.")).toBeVisible();

    await years.blur();
    await expect(years).toHaveValue("12");
    await expect(page.getByText("Enter a whole number from 1 to 99.")).toBeHidden();
  });

  test("selects the fixed term when the years box is clicked", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("In perpetuity").check();
    await page.getByLabel("Term of confidentiality in years").click();
    await expect(page.getByLabel("Protected for")).toBeChecked();
  });

  test("opens Common Paper links in a new tab", async ({ page, context }) => {
    await page.goto("/");
    const link = preview(page).getByRole("link", { name: "commonpaper.com/standards/mutual-nda/1.0" });
    await expect(link).toHaveAttribute("href", "https://commonpaper.com/standards/mutual-nda/1.0");
    await context.route("https://commonpaper.com/**", (route) => route.fulfill({ body: "ok" }));
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    expect(popup.url()).toBe("https://commonpaper.com/standards/mutual-nda/1.0");
    expect(page.url()).toMatch(/\/$/);
  });
});

test.describe("PDF download", () => {
  test("downloads the completed agreement as a PDF", async ({ page }) => {
    await page.goto("/");
    await fillForm(page);
    const { download, text, pages } = await downloadPdf(page);

    expect(download.suggestedFilename()).toBe("Mutual-NDA-Acme-Inc-Globex-LLC.pdf");
    for (const expected of [
      "Mutual Non-Disclosure Agreement",
      "Exploring a joint go-to-market partnership.",
      "January 15, 2027",
      "X Continues until terminated in accordance with the terms of the MNDA.",
      "X 3 years from Effective Date",
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
      "Retention limited to 90 days.",
      "Jane Doe",
      "Globex LLC",
      "1 Main St, Springfield",
      "11. General.",
      "free to use under CC BY 4.0",
    ]) {
      expect(text).toContain(expected);
    }
    expect(pages[0]).toContain("PARTY 2"); // signature table on the cover page
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });

  test("downloads a blank-form PDF with placeholders and a generic name", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Effective date").fill("");
    const { download, text } = await downloadPdf(page);
    expect(download.suggestedFilename()).toBe("Mutual-NDA.pdf");
    expect(text).toContain("[Effective Date]");
    expect(text).toContain("Governing Law: [Governing Law]");
  });

  test("works with the keyboard alone", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Governing law").fill("Delaware");
    const button = page.getByRole("button", { name: "Download PDF" });
    await button.focus();
    await expect(button).toBeFocused();
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    expect(download.suggestedFilename()).toBe("Mutual-NDA.pdf");
  });

  test("loads the PDF library only when downloading", async ({ page }) => {
    const pdfChunks: string[] = [];
    page.on("response", async (res) => {
      if (res.url().endsWith(".js") && (await res.text()).includes("registerHyphenationCallback")) {
        pdfChunks.push(res.url());
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(pdfChunks).toEqual([]);
    await downloadPdf(page);
    expect(pdfChunks.length).toBeGreaterThan(0);
  });
});

test.describe("responsive layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stacks the form above the preview on phones with no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    const formBox = await page.getByLabel("Purpose").boundingBox();
    const previewBox = await preview(page).boundingBox();
    expect(formBox!.y).toBeLessThan(previewBox!.y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeInViewport();
  });
});

test.describe("desktop layout", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the header in view and scrolls the form and preview independently", async ({ page }) => {
    await page.goto("/");
    // The page itself doesn't scroll; each panel does.
    const pageScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(pageScroll).toBeLessThanOrEqual(0);

    const previewPanel = preview(page);
    await previewPanel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(previewPanel.getByText(/^11\. General\./)).toBeInViewport();
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeInViewport();
    await expect(page.getByLabel("Purpose")).toBeInViewport(); // form didn't move

    await party(page, 2).getByLabel("Notice address").scrollIntoViewIfNeeded();
    await expect(party(page, 2).getByLabel("Notice address")).toBeInViewport();
  });
});
