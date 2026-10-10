import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AuthForm from "@/components/AuthForm";
import { AuthProvider, useAuth } from "@/lib/auth";
import { meRoute, mockApi, type RouteHandler } from "../fixtures";

/** Shows the auth status, so tests can see the form sign the user in. */
function Status() {
  const { status, email } = useAuth();
  return <p data-testid="auth">{status === "signedIn" ? `in:${email}` : status}</p>;
}

async function renderForm(mode: "signin" | "signup", routes: Record<string, RouteHandler>) {
  const requests = mockApi({ "GET /api/auth/me": meRoute(null), ...routes });
  render(
    <AuthProvider>
      <AuthForm mode={mode} />
      <Status />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("signedOut"));
  return { requests, user: userEvent.setup() };
}

const fill = async (user: ReturnType<typeof userEvent.setup>, email: string, password: string) => {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText(/^Password/), password);
};

describe("AuthForm", () => {
  describe("sign in", () => {
    it("has a heading, labelled fields and a link to sign up", async () => {
      await renderForm("signin", {});
      expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
      expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
      expect(screen.getByLabelText("Email")).toBeRequired();
      expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
      expect(screen.getByLabelText("Password")).toBeRequired();
      expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/signup\/?$/),
      );
    });

    it("signs in with the user's credentials", async () => {
      const { requests, user } = await renderForm("signin", {
        "POST /api/auth/signin": () => ({ email: "jane@acme.com" }),
      });
      await fill(user, "jane@acme.com", "pa55word!{Enter}");

      await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("in:jane@acme.com"));
      expect(requests.at(-1)).toMatchObject({
        url: "/api/auth/signin",
        body: { email: "jane@acme.com", password: "pa55word!" },
      });
    });

    it("shows why sign-in failed and lets the user try again", async () => {
      let attempts = 0;
      const { user } = await renderForm("signin", {
        "POST /api/auth/signin": () =>
          ++attempts === 1
            ? Response.json({ detail: "Incorrect email or password." }, { status: 401 })
            : { email: "jane@acme.com" },
      });
      await fill(user, "jane@acme.com", "wrong");
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Incorrect email or password.");
      expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Incorrect email or password.");
      expect(screen.getByTestId("auth")).toHaveTextContent("signedOut");

      await user.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("in:jane@acme.com"));
    });

    it("shows progress and prevents double submits", async () => {
      let finish!: () => void;
      const { requests, user } = await renderForm("signin", {
        "POST /api/auth/signin": () =>
          new Promise((resolve) => (finish = () => resolve({ email: "jane@acme.com" }))),
      });
      await fill(user, "jane@acme.com", "pa55word!");
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      const button = screen.getByRole("button", { name: "Signing in…" });
      expect(button).toBeDisabled();
      await user.click(button);
      expect(requests.filter((r) => r.url === "/api/auth/signin")).toHaveLength(1);
      finish();
      await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("in:jane@acme.com"));
    });

    it("leaves empty fields to the browser's validation", async () => {
      const { requests, user } = await renderForm("signin", {});
      await user.click(screen.getByRole("button", { name: "Sign in" }));
      expect(requests).toHaveLength(1); // just the session check
    });
  });

  describe("sign up", () => {
    it("asks for a new password of at least 8 characters", async () => {
      await renderForm("signup", {});
      expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeInTheDocument();
      const password = screen.getByLabelText(/^Password/);
      expect(password).toHaveAttribute("autocomplete", "new-password");
      expect(password).toHaveAttribute("minlength", "8");
      expect(password).toHaveAccessibleDescription("At least 8 characters.");
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/");
    });

    it("creates the account and signs in", async () => {
      const { requests, user } = await renderForm("signup", {
        "POST /api/auth/signup": () => ({ email: "jane@acme.com" }),
      });
      await fill(user, "jane@acme.com", "pa55word!");
      await user.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("in:jane@acme.com"));
      expect(requests.at(-1)).toMatchObject({ url: "/api/auth/signup" });
    });

    it("explains a taken email", async () => {
      const { user } = await renderForm("signup", {
        "POST /api/auth/signup": () =>
          Response.json({ detail: "An account with this email already exists." }, { status: 409 }),
      });
      await fill(user, "jane@acme.com", "pa55word!");
      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("An account with this email already exists.");
      expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(
        "An account with this email already exists. At least 8 characters.",
      );
    });
  });
});
