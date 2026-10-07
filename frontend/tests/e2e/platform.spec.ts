import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "jane@acme.com") {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/app/");
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.describe("backend", () => {
  test("reports healthy, with its database reachable", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });

  test("answers unknown API paths with JSON 404s", async ({ request }) => {
    const response = await request.get("/api/nope");
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ detail: "Not Found" });
  });

  test("serves the frontend's 404 page for unknown pages", async ({ page }) => {
    const response = await page.goto("/no-such-page/");
    expect(response!.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.getByRole("link", { name: "Go to your documents" }).click();
    await expect(page).toHaveURL("/app/");
  });
});

test.describe("sign in", () => {
  test("renders without console errors and passes an accessibility scan", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") problems.push(msg.text());
    });
    page.on("pageerror", (err) => problems.push(err.message));

    await page.goto("/");
    await expect(page).toHaveTitle("Sign in | Prelegal");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
    await expectNoAxeViolations(page);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("requires an email and password", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    expect(await page.getByLabel("Email").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  });

  test("accepts any credentials and lands on the dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveTitle("Documents | Prelegal");
    await expect(page.getByRole("banner").getByText("jane@acme.com")).toBeVisible();
  });
});

test.describe("dashboard", () => {
  test("lists the catalog with only the Mutual NDA available", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Documents");
    const cards = page.getByRole("listitem");
    await expect(cards).toHaveCount(11);
    await expect(page.getByRole("link", { name: /^Create / })).toHaveCount(1);
    await expect(page.getByText("Coming soon")).toHaveCount(10);
    await expect(cards.first().getByRole("heading")).toHaveText("Mutual Non-Disclosure Agreement");
    await expectNoAxeViolations(page);
  });

  test("opens the Mutual NDA creator and comes back", async ({ page }) => {
    await signIn(page);
    await page.getByRole("link", { name: "Create Mutual Non-Disclosure Agreement" }).click();
    await expect(page).toHaveURL("/app/nda/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mutual NDA Creator");
    await expect(page.getByRole("banner").getByText("jane@acme.com")).toBeVisible();
    await page.getByRole("link", { name: "Prelegal" }).click();
    await expect(page).toHaveURL("/app/");
  });

  test("signs out back to the sign-in page", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/app/");
    await expect(page.getByRole("banner").getByText("jane@acme.com")).toHaveCount(0);
  });

  test("redirects paths without a trailing slash", async ({ page }) => {
    await page.goto("/app/nda");
    await expect(page).toHaveURL("/app/nda/");
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ["/", "/app/", "/app/nda/"]) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await signIn(page, "a.very.long.email.address@example-company.com");
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("keeps Sign out visible next to a long email", async ({ page }) => {
    await signIn(page, "a.very.long.email.address@example-company.com");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
  });
});
