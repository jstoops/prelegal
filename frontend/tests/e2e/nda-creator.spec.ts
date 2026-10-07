import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

const NDA_PATH = "/app/nda/";
const FIXED_NOW = new Date("2026-10-05T15:00:00-04:00"); // Oct 5, 2026 in New York

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

const preview = (page: Page) => page.getByRole("region", { name: "NDA preview" });
const chatLog = (page: Page) => page.getByRole("log", { name: "Conversation with the assistant" });
const messageBox = (page: Page) => page.getByRole("textbox", { name: "Message the assistant" });

const GREETING = "Hi! I'll help you draft your Mutual NDA. Who are the two parties?";

interface ChatBody {
  messages: { role: "user" | "assistant"; content: string }[];
  data: Record<string, unknown> & { parties: Record<string, string>[] };
  today: string;
}

type Script = Record<string, { reply: string; updates?: object }>;

/**
 * Stands in for the LLM: the real backend has no API key in these tests, so
 * `/api/chat` is answered in the browser. Each user message is looked up in
 * `script`, and its updates are merged into the NDA the page sent.
 */
async function mockAssistant(page: Page, script: Script = {}) {
  const requests: ChatBody[] = [];
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as ChatBody;
    requests.push(body);
    const last = body.messages.at(-1);
    const turn = last ? (script[last.content] ?? { reply: "Noted." }) : { reply: GREETING };
    await route.fulfill({ json: { reply: turn.reply, data: { ...body.data, ...turn.updates } } });
  });
  return requests;
}

const PARTIES =
  "Acme, Inc. (Jane Doe, CEO, legal@acme.com) and Globex LLC (John Roe, CTO, 1 Main St, Springfield).";
const TERMS =
  "Joint go-to-market partnership, starting January 15, 2027, until terminated, confidential for 3 years.";
const LAW = "Delaware law, courts in New Castle, DE. Retention limited to 90 days.";

const FULL_SCRIPT: Script = {
  [PARTIES]: {
    reply: "Thanks! What's the purpose of the NDA?",
    updates: {
      parties: [
        { company: "Acme, Inc.", printName: "Jane Doe", title: "CEO", noticeAddress: "legal@acme.com" },
        { company: "Globex LLC", printName: "John Roe", title: "CTO", noticeAddress: "1 Main St, Springfield" },
      ],
    },
  },
  [TERMS]: {
    reply: "Got it. Which state's law governs it?",
    updates: {
      purpose: "Exploring a joint go-to-market partnership.",
      effectiveDate: "2027-01-15",
      mndaTermType: "open",
      confidentialityYears: 3,
    },
  },
  [LAW]: {
    reply: "All set! Review the preview and click Download PDF.",
    updates: {
      governingLaw: "Delaware",
      jurisdiction: "New Castle, DE",
      modifications: "Retention limited to 90 days.",
    },
  },
};

async function say(page: Page, text: string) {
  await messageBox(page).fill(text);
  await messageBox(page).press("Enter");
  await expect(chatLog(page).getByText(FULL_SCRIPT[text].reply)).toBeVisible();
}

/** Opens the creator and waits for the assistant's greeting. */
async function openCreator(page: Page, script: Script = {}) {
  const requests = await mockAssistant(page, script);
  await page.goto(NDA_PATH);
  await expect(chatLog(page).getByText(GREETING)).toBeVisible();
  return requests;
}

/** Opens the creator and fills in the whole NDA by chatting. */
async function chatFullNda(page: Page) {
  await openCreator(page, FULL_SCRIPT);
  for (const text of [PARTIES, TERMS, LAW]) await say(page, text);
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

    await openCreator(page);
    await expect(page).toHaveTitle("Mutual NDA Creator | Prelegal");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mutual NDA Creator");
    await expect(preview(page).getByRole("heading", { name: "Standard Terms" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("defaults the effective date to today in the browser's time zone", async ({ page }) => {
    await openCreator(page);
    await expect(preview(page).getByText("October 5, 2026")).toBeVisible();
  });

  test("passes an automated accessibility scan (WCAG 2.1 AA)", async ({ page }) => {
    await openCreator(page, FULL_SCRIPT);
    await say(page, PARTIES);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe("AI chat and live preview", () => {
  test("fills in every field of the preview from the conversation", async ({ page }) => {
    await chatFullNda(page);
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

  test("sends the whole conversation, the current NDA and the local date", async ({ page }) => {
    const requests = await openCreator(page, FULL_SCRIPT);
    await say(page, PARTIES);
    await say(page, TERMS);

    expect(requests[0]).toMatchObject({ messages: [], today: "2026-10-05", data: { effectiveDate: "" } });
    const last = requests.at(-1)!;
    expect(last.messages.map((m) => m.role)).toEqual(["assistant", "user", "assistant", "user"]);
    expect(last.data.parties[0].company).toBe("Acme, Inc.");
  });

  test("shows errors from the assistant and retries", async ({ page }) => {
    await openCreator(page, FULL_SCRIPT);
    // Fail the next request only, then fall back to the scripted assistant.
    let failed = false;
    await page.route("**/api/chat", async (route) => {
      if (failed) return route.fallback();
      failed = true;
      await route.fulfill({
        status: 502,
        json: { detail: "The AI assistant is unavailable. Please try again." },
      });
    });
    await messageBox(page).fill(PARTIES);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(chatLog(page).getByRole("alert")).toHaveText(/The AI assistant is unavailable/);

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(chatLog(page).getByText(FULL_SCRIPT[PARTIES].reply)).toBeVisible();
    await expect(chatLog(page).getByRole("alert")).toBeHidden();
    await expect(chatLog(page).getByText(PARTIES)).toHaveCount(1);
    const companies = preview(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Company" }) });
    await expect(companies.getByRole("cell")).toHaveText(["Acme, Inc.", "Globex LLC"]);
  });

  test("explains when the real backend has no AI key configured", async ({ page }) => {
    await page.goto(NDA_PATH); // not mocked: the e2e server runs without a key
    await expect(chatLog(page).getByRole("alert")).toHaveText(/The AI assistant isn't configured\./);
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("opens Common Paper links in a new tab", async ({ page, context }) => {
    await openCreator(page);
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
    await chatFullNda(page);
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
    await openCreator(page);
    const { download, text } = await downloadPdf(page);
    expect(download.suggestedFilename()).toBe("Mutual-NDA.pdf");
    expect(text).toContain("October 5, 2026");
    expect(text).toContain("Governing Law: [Governing Law]");
  });

  test("works with the keyboard alone", async ({ page }) => {
    await openCreator(page);
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
    await openCreator(page);
    await page.waitForLoadState("networkidle");
    expect(pdfChunks).toEqual([]);
    await downloadPdf(page);
    expect(pdfChunks.length).toBeGreaterThan(0);
  });
});

test.describe("responsive layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stacks the chat above the preview on phones with no horizontal scroll", async ({ page }) => {
    await openCreator(page);
    const chatBox = await chatLog(page).boundingBox();
    const previewBox = await preview(page).boundingBox();
    expect(chatBox!.y).toBeLessThan(previewBox!.y);
    await expect(messageBox(page)).toBeInViewport();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeInViewport();
  });
});
