import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery";

/**
 * A new email for each call. The e2e server (and its database) may be reused
 * between runs, and tests run in parallel, so accounts must never collide.
 */
export const uniqueEmail = (name = "user") => `${name}-${randomUUID().slice(0, 8)}@example.com`;

/**
 * Creates an account through the API and signs the page in: `page.request`
 * shares the browser context's cookies. Faster than the form, which the auth
 * tests cover.
 */
export async function signUp(page: Page, email = uniqueEmail()): Promise<string> {
  const response = await page.request.post("/api/auth/signup", { data: { email, password: PASSWORD } });
  expect(response.status(), await response.text()).toBe(201);
  return email;
}

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  // Name the failing elements, so the report shows where to look.
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(", ")})`)).toEqual([]);
}

/** The app header's navigation (its links share names with buttons on the pages). */
export const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
