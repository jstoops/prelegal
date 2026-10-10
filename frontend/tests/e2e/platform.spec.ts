import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, mainNav, PASSWORD, signUp, uniqueEmail } from "./helpers";

const DISCLAIMER = /drafts and are subject to legal review/;

async function fillCredentials(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
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

  test("refuses the API without a session", async ({ request }) => {
    for (const path of ["/api/auth/me", "/api/documents"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
    }
  });

  test("serves the frontend's 404 page for unknown pages", async ({ page }) => {
    await signUp(page);
    const response = await page.goto("/no-such-page/");
    expect(response!.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.getByRole("link", { name: "Go to your documents" }).click();
    await expect(page).toHaveURL("/app/");
  });
});

test.describe("sign up and sign in", () => {
  for (const [path, title, heading] of [
    ["/", "Sign in | Prelegal", "Sign in"],
    ["/signup/", "Create account | Prelegal", "Create your account"],
  ]) {
    test(`${path} renders without console errors and passes an accessibility scan`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        // The session check's 401 is expected when signed out.
        if (msg.text().includes("401")) return;
        if (msg.type() === "error" || msg.type() === "warning") problems.push(msg.text());
      });
      page.on("pageerror", (err) => problems.push(err.message));

      await page.goto(path);
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("contentinfo")).toContainText(DISCLAIMER);
      await expectNoAxeViolations(page);
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });
  }

  test("signs up, signs out and signs back in", async ({ page }) => {
    const email = uniqueEmail("jane");
    await page.goto("/");
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL("/signup/");

    await fillCredentials(page, email);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/app/");
    await expect(page).toHaveTitle("New document | Prelegal");
    await expect(page.getByRole("banner").getByText(email)).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/app/");
    await expect(page).toHaveURL("/"); // signed out: back to sign in

    await fillCredentials(page, email.toUpperCase());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/app/");
    await expect(page.getByRole("banner").getByText(email)).toBeVisible();
  });

  test("stays signed in across reloads and new tabs", async ({ page, context }) => {
    const email = await signUp(page);
    await page.goto("/app/");
    await page.reload();
    await expect(page.getByRole("banner").getByText(email)).toBeVisible();

    const tab = await context.newPage();
    await tab.goto("/");
    await expect(tab).toHaveURL("/app/"); // signed in: no sign-in page
  });

  test("explains a wrong password", async ({ page }) => {
    const email = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/");
    await fillCredentials(page, email, "not the password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL("/");
  });

  test("explains that an email is already registered", async ({ page }) => {
    const email = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/signup/");
    await fillCredentials(page, email);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("An account with this email already exists.");
  });

  test("asks for a longer password", async ({ page }) => {
    await page.goto("/signup/");
    await fillCredentials(page, uniqueEmail(), "short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/signup/");
    expect(await page.getByLabel(/^Password/).evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);
  });

  test("requires an email and password", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    expect(await page.getByLabel("Email").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  });

  for (const path of ["/app/", "/app/documents/", "/app/create/?doc=mutual-nda"]) {
    test(`keeps signed-out visitors out of ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
    });
  }

  test("signs the user out when their session ends", async ({ page }) => {
    await signUp(page);
    await page.goto("/app/documents/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("My documents");
    await page.context().clearCookies(); // e.g. the session expired
    // The dashboard lists recent documents, which the API now refuses.
    await mainNav(page).getByRole("link", { name: "New document" }).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await page.goto("/app/");
  });

  test("lists every document, each with a Create link", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New document");
    const cards = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: /^Create / }) });
    await expect(cards).toHaveCount(11);
    await expect(cards.first().getByRole("heading")).toHaveText("Mutual Non-Disclosure Agreement");
    // A new user has no recent documents to show.
    await expect(page.getByRole("heading", { name: "Recent documents" })).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toContainText(DISCLAIMER);
    await expectNoAxeViolations(page);
  });

  test("opens the Mutual NDA creator and comes back", async ({ page }) => {
    await page.getByRole("link", { name: "Create Mutual Non-Disclosure Agreement" }).click();
    await expect(page).toHaveURL("/app/create/?doc=mutual-nda");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mutual Non-Disclosure Agreement");
    await page.getByRole("link", { name: "Prelegal" }).click();
    await expect(page).toHaveURL("/app/");
  });

  test("goes back to the document list from the creator", async ({ page }) => {
    await page.getByRole("link", { name: "Create Pilot Agreement" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pilot Agreement");
    const back = page.getByRole("link", { name: "Back to all documents" });
    await expect(back).toHaveText(/All documents/);
    await back.click();
    await expect(page).toHaveURL("/app/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New document");
  });

  test("asks the assistant when the user isn't sure which document they need", async ({ page }) => {
    await page.getByRole("link", { name: "Ask the assistant" }).click();
    await expect(page).toHaveURL("/app/create/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New Document");
  });

  test("navigates between New document and My documents", async ({ page }) => {
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "New document" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "My documents" }).click();
    await expect(page).toHaveURL("/app/documents/");
    await expect(page).toHaveTitle("My documents | Prelegal");
    await expect(nav.getByRole("link", { name: "My documents" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("redirects paths without a trailing slash", async ({ page }) => {
    await page.goto("/app/create");
    await expect(page).toHaveURL("/app/create/");
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const LONG_EMAIL = () => `a.very.long.email.address-${uniqueEmail("x")}`;
  const noHorizontalScroll = async (page: Page) => {
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  };

  for (const path of ["/", "/signup/"]) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noHorizontalScroll(page);
    });
  }

  for (const path of ["/app/", "/app/documents/", "/app/create/", "/app/create/?doc=professional-services-agreement"]) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await signUp(page, LONG_EMAIL());
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noHorizontalScroll(page);
    });
  }

  test("keeps the back link visible in the creator", async ({ page }) => {
    await signUp(page);
    await page.goto("/app/create/?doc=professional-services-agreement");
    await expect(page.getByRole("link", { name: "Back to all documents" })).toBeInViewport();
  });

  test("keeps the navigation and Sign out visible with a long email", async ({ page }) => {
    await signUp(page, LONG_EMAIL());
    await page.goto("/app/");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
    await expect(mainNav(page).getByRole("link", { name: "My documents" })).toBeInViewport();
  });
});
