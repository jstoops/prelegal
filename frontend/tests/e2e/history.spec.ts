import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, mainNav, signUp } from "./helpers";

/**
 * Saved documents. The e2e server has no LLM, so the chat never saves for
 * real here: `mockSavingBackend` stands in for the chat and the saved
 * documents API, saving as the real backend does (its tests cover the real
 * thing). The real backend still answers the tests that don't save.
 */

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Saved {
  id: string;
  documentId: string;
  title: string;
  updatedAt: string;
  data: { documentId: string | null; fields: Record<string, unknown>; parties: Record<string, string>[] };
  messages: Message[];
}

const GREETING = "Hi! Shall we start with the parties?";

async function mockSavingBackend(page: Page) {
  const saved = new Map<string, Saved>();
  const chatRequests: { messages: Message[]; savedId: string | null }[] = [];
  let nextId = 1;

  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    chatRequests.push(body);
    const reply = body.messages.length === 0 ? GREETING : `Noted: ${body.messages.at(-1).content}`;
    const data = { ...body.data, parties: [{ ...body.data.parties[0], company: "Acme" }, body.data.parties[1]] };
    let savedId = body.savedId;
    // Like the backend: saved once there's a document and a message from the user.
    if (data.documentId && body.messages.length > 0) {
      savedId ??= `draft-${nextId++}`;
      saved.set(savedId, {
        id: savedId,
        documentId: data.documentId,
        title: "Mutual Non-Disclosure Agreement - Acme",
        updatedAt: new Date().toISOString(),
        data,
        messages: [...body.messages, { role: "assistant", content: reply }],
      });
    }
    await route.fulfill({ json: { reply, data, savedId } });
  });

  await page.route("**/api/documents", (route) =>
    route.fulfill({
      json: {
        documents: [...saved.values()].reverse().map(({ id, documentId, title, updatedAt }) => ({
          id,
          documentId,
          title,
          updatedAt,
        })),
      },
    }),
  );

  await page.route("**/api/documents/*", async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1)!);
    const draft = saved.get(id);
    if (!draft) return route.fulfill({ status: 404, json: { detail: "Document not found." } });
    if (route.request().method() === "DELETE") {
      saved.delete(id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: draft });
  });

  return { saved, chatRequests };
}

const chatLog = (page: Page) => page.getByRole("log", { name: "Conversation with the assistant" });
const messageBox = (page: Page) => page.getByRole("textbox", { name: "Message the assistant" });

async function say(page: Page, text: string) {
  await messageBox(page).fill(text);
  await messageBox(page).press("Enter");
  await expect(chatLog(page).getByText(`Noted: ${text}`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signUp(page);
});

test("a new account has no saved documents", async ({ page }) => {
  await page.goto("/app/documents/");
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  await page.getByRole("link", { name: "Start a new document" }).click();
  await expect(page).toHaveURL("/app/");
});

test("explains when a saved document can't be opened", async ({ page }) => {
  await page.goto("/app/create/?id=not-mine");
  await expect(page.getByRole("heading", { name: "We couldn't open this document" })).toBeVisible();
  await page.getByRole("link", { name: "Back to My documents" }).click();
  await expect(page).toHaveURL("/app/documents/");
});

test("saves the document as the user chats, and picks it back up later", async ({ page }) => {
  const { chatRequests } = await mockSavingBackend(page);

  await page.goto("/app/create/?doc=mutual-nda");
  await expect(chatLog(page).getByText(GREETING)).toBeVisible();
  await expect(page.getByRole("link", { name: "Saved to My documents" })).toHaveCount(0);

  await say(page, "Acme and Globex");
  await page.getByRole("link", { name: "Saved to My documents" }).click();

  await expect(page).toHaveURL("/app/documents/");
  const row = page.getByRole("listitem").filter({ hasText: "Mutual Non-Disclosure Agreement - Acme" });
  await expect(row).toContainText("Edited just now");
  await expectNoAxeViolations(page);

  // The dashboard shows it too.
  await mainNav(page).getByRole("link", { name: "New document" }).click();
  await expect(page.getByRole("heading", { name: "Recent documents" })).toBeVisible();

  await page.getByRole("link", { name: "Open Mutual Non-Disclosure Agreement - Acme" }).click();
  await expect(page).toHaveURL("/app/create/?id=draft-1");
  await expect(chatLog(page).getByText("Noted: Acme and Globex")).toBeVisible();
  await expect(page.getByRole("region", { name: "Document preview" }).getByRole("cell", { name: "Acme" })).toBeVisible();
  const requestsBefore = chatRequests.length;

  await say(page, "The purpose is hiring");

  // One more turn, no new greeting, and it updated the same document.
  expect(chatRequests.slice(requestsBefore)).toEqual([
    expect.objectContaining({ savedId: "draft-1" }),
  ]);
  expect(chatRequests.at(-1)!.messages.map((m) => m.content)).toEqual([
    GREETING,
    "Acme and Globex",
    "Noted: Acme and Globex",
    "The purpose is hiring",
  ]);
  await mainNav(page).getByRole("link", { name: "My documents" }).click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1);
});

test("deletes a saved document", async ({ page }) => {
  const { saved } = await mockSavingBackend(page);
  await page.goto("/app/create/?doc=mutual-nda");
  await expect(chatLog(page).getByText(GREETING)).toBeVisible();
  await say(page, "Acme and Globex");

  await page.goto("/app/documents/");
  await page.getByRole("button", { name: "Delete Mutual Non-Disclosure Agreement - Acme" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  expect(saved.size).toBe(0);
});

test("the creator says documents are drafts subject to legal review", async ({ page }) => {
  await mockSavingBackend(page);
  await page.goto("/app/create/?doc=mutual-nda");
  await expect(page.getByRole("note")).toContainText("Draft only.");
  await expect(page.getByRole("note")).toContainText("subject to legal review");
});
