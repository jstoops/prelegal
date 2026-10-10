import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import { expectNoAxeViolations, signUp } from "./helpers";

const NDA_PATH = "/app/create/?doc=mutual-nda";
const FIXED_NOW = new Date("2026-10-05T15:00:00-04:00"); // Oct 5, 2026 in New York

interface FieldDefinition {
  key: string;
  kind: string;
  default?: string | number;
  options?: { value: string }[];
}

const DOCUMENTS: { id: string; name: string; fields: FieldDefinition[] }[] = JSON.parse(
  readFileSync(path.resolve(__dirname, "..", "..", "..", "documents.json"), "utf8"),
).documents;

/** A document's fields at their defaults, as the backend fills them in. */
const defaultFields = (id: string) =>
  Object.fromEntries(
    DOCUMENTS.find((d) => d.id === id)!.fields.map((f) => [
      f.key,
      f.default ?? (f.kind === "years" ? 1 : f.kind === "choice" ? f.options![0].value : ""),
    ]),
  );

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await signUp(page);
});

const preview = (page: Page) => page.getByRole("region", { name: "Document preview" });
const chatLog = (page: Page) => page.getByRole("log", { name: "Conversation with the assistant" });
const messageBox = (page: Page) => page.getByRole("textbox", { name: "Message the assistant" });
const pageTitle = (page: Page) => page.getByRole("heading", { level: 1 });

const GREETING = "Hi! I'll help you draft your agreement. Are the pre-filled terms right?";

interface ChatData {
  documentId: string | null;
  fields: Record<string, unknown>;
  parties: Record<string, string>[];
}

interface ChatBody {
  messages: { role: "user" | "assistant"; content: string }[];
  data: ChatData;
  today: string;
  savedId: string | null;
}

interface Turn {
  reply: string;
  /** Field values to set. */
  fields?: Record<string, unknown>;
  parties?: Record<string, string>[];
  /** A document to switch to, starting from its defaults. */
  documentId?: string;
}

type Script = Record<string, Turn>;

/**
 * Stands in for the LLM: the real backend has no API key in these tests, so
 * `/api/chat` is answered in the browser. Each user message is looked up in
 * `script`, and its updates are applied to the document the page sent.
 */
async function mockAssistant(page: Page, script: Script = {}) {
  const requests: ChatBody[] = [];
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as ChatBody;
    requests.push(body);
    const last = body.messages.at(-1);
    const turn: Turn = last ? (script[last.content] ?? { reply: "Noted." }) : { reply: GREETING };
    const data = turn.documentId
      ? { ...body.data, documentId: turn.documentId, fields: defaultFields(turn.documentId) }
      : body.data;
    await route.fulfill({
      json: {
        reply: turn.reply,
        data: { ...data, fields: { ...data.fields, ...turn.fields }, parties: turn.parties ?? data.parties },
        // Saving is the real backend's job (covered by its tests); this stand-in never saves.
        savedId: body.savedId,
      },
    });
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
    parties: [
      { company: "Acme, Inc.", printName: "Jane Doe", title: "CEO", noticeAddress: "legal@acme.com" },
      { company: "Globex LLC", printName: "John Roe", title: "CTO", noticeAddress: "1 Main St, Springfield" },
    ],
  },
  [TERMS]: {
    reply: "Got it. Which state's law governs it?",
    fields: {
      purpose: "Exploring a joint go-to-market partnership.",
      effectiveDate: "2027-01-15",
      mndaTermType: "open",
      confidentialityYears: 3,
    },
  },
  [LAW]: {
    reply: "All set! Review the preview and click Download PDF.",
    fields: {
      governingLaw: "Delaware",
      jurisdiction: "New Castle, DE",
      modifications: "Retention limited to 90 days.",
    },
  },
};

async function say(page: Page, text: string, script = FULL_SCRIPT) {
  await messageBox(page).fill(text);
  await messageBox(page).press("Enter");
  await expect(chatLog(page).getByText(script[text].reply)).toBeVisible();
}

/** Opens the creator and waits for the assistant's greeting. */
async function openCreator(page: Page, script: Script = {}, url = NDA_PATH) {
  const requests = await mockAssistant(page, script);
  await page.goto(url);
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
  const bytes = new Uint8Array(readFileSync(await download.path()));
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
    await expect(page).toHaveTitle("Document Creator | Prelegal");
    await expect(pageTitle(page)).toHaveText("Mutual Non-Disclosure Agreement");
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
    await expectNoAxeViolations(page);
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

  test("sends the whole conversation, the current document and the local date", async ({ page }) => {
    const requests = await openCreator(page, FULL_SCRIPT);
    await say(page, PARTIES);
    await say(page, TERMS);

    expect(requests[0]).toMatchObject({
      messages: [],
      today: "2026-10-05",
      data: { documentId: "mutual-nda", fields: { effectiveDate: "" } },
    });
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
    expect(page.url()).toContain(NDA_PATH);
  });
});

test.describe("choosing a document in the chat", () => {
  const UNSUPPORTED = "I need an employment contract.";
  const NEED = "We sell a SaaS analytics product. Acme, Inc. is the provider.";
  const SWITCH = "Actually, we only want a 30-day pilot first.";
  const CHOOSE_SCRIPT: Script = {
    [UNSUPPORTED]: {
      reply: "I can't draft employment contracts. The closest is a Professional Services Agreement. Want that?",
    },
    [NEED]: {
      reply: "A Cloud Service Agreement fits. I've pre-filled some standard terms: are they right?",
      documentId: "cloud-service-agreement",
      parties: [
        { company: "Acme, Inc.", printName: "", title: "", noticeAddress: "" },
        { company: "", printName: "", title: "", noticeAddress: "" },
      ],
    },
    [SWITCH]: {
      reply: "Switched to a Pilot Agreement, keeping Acme, Inc. as the provider.",
      documentId: "pilot-agreement",
    },
  };

  test("starts without a document, then shows the one the assistant picks", async ({ page }) => {
    const requests = await openCreator(page, CHOOSE_SCRIPT, "/app/create/");
    await expect(pageTitle(page)).toHaveText("New Document");
    await expect(preview(page).getByRole("heading", { name: "No document chosen yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
    expect(requests[0].data).toEqual({
      documentId: null,
      fields: {},
      parties: [
        { printName: "", title: "", company: "", noticeAddress: "" },
        { printName: "", title: "", company: "", noticeAddress: "" },
      ],
    });

    await say(page, UNSUPPORTED, CHOOSE_SCRIPT);
    await expect(pageTitle(page)).toHaveText("New Document");

    await say(page, NEED, CHOOSE_SCRIPT);
    await expect(pageTitle(page)).toHaveText("Cloud Service Agreement");
    const doc = preview(page);
    await expect(doc.getByRole("heading", { level: 2, name: "Cloud Service Agreement" })).toBeVisible();
    await expect(doc.getByRole("columnheader")).toHaveText(["PROVIDER", "CUSTOMER"]);
    await expect(doc.getByText("Restrictions on Customer.")).toBeVisible();

    const { download, text } = await downloadPdf(page);
    expect(download.suggestedFilename()).toBe("Cloud-Service-Agreement-Acme-Inc.pdf");
    expect(text).toContain("Subscription Period");
    expect(text).toContain("2.1 Restrictions on Customer.");
    expect(text).toContain("Common Paper Cloud Service Agreement (Version 3.0) free to use under CC BY 4.0.");
  });

  test("follows the assistant when it switches documents", async ({ page }) => {
    await openCreator(page, CHOOSE_SCRIPT, "/app/create/");
    await say(page, NEED, CHOOSE_SCRIPT);
    await say(page, SWITCH, CHOOSE_SCRIPT);
    await expect(pageTitle(page)).toHaveText("Pilot Agreement");
    await expect(preview(page).getByRole("heading", { level: 3, name: "Pilot Period" })).toBeVisible();
    const companies = preview(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Company" }) });
    await expect(companies.getByRole("cell")).toHaveText(["Acme, Inc.", ""]);
  });

  test("passes an accessibility scan before a document is chosen", async ({ page }) => {
    await openCreator(page, {}, "/app/create/");
    await expectNoAxeViolations(page);
  });

  for (const { id, name } of DOCUMENTS) {
    test(`previews the ${name} from its dashboard link`, async ({ page }) => {
      const problems: string[] = [];
      page.on("pageerror", (err) => problems.push(err.message));
      const requests = await openCreator(page, {}, `/app/create/?doc=${id}`);
      await expect(pageTitle(page)).toHaveText(name);
      await expect(preview(page).getByRole("heading", { level: 2, name })).toBeVisible();
      await expect(preview(page).getByRole("heading", { name: "Standard Terms" })).toBeVisible();
      expect(requests[0].data).toMatchObject({ documentId: id, fields: defaultFields(id) });
      expect(problems).toEqual([]);
    });
  }
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
      // Only bodies count: cached (304) responses have none.
      if (!res.url().endsWith(".js") || res.status() !== 200) return;
      if ((await res.text().catch(() => "")).includes("registerHyphenationCallback")) {
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

test.describe("desktop layout", () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    test(`keeps the message box in view at ${viewport.width}x${viewport.height}, before and after scrolling`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openCreator(page);
      await expect(messageBox(page)).toBeInViewport({ ratio: 1 });
      await page.mouse.wheel(0, 5000); // to the end of the Standard Terms
      await expect(messageBox(page)).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("note")).toContainText("Draft only.");
    });
  }
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
