import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppHeader from "@/components/AppHeader";
import { AuthProvider } from "@/lib/auth";
import { meRoute, mockApi } from "../fixtures";

const pathname = vi.fn(() => "/app/");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

beforeEach(() => pathname.mockReturnValue("/app/"));

function renderHeader() {
  const requests = mockApi({
    "GET /api/auth/me": meRoute("jane@acme.com"),
    "POST /api/auth/signout": () => undefined,
  });
  render(
    <AuthProvider>
      <AppHeader />
    </AuthProvider>,
  );
  return { requests, user: userEvent.setup() };
}

describe("AppHeader", () => {
  // next/link only keeps trailing slashes when built with trailingSlash: true;
  // the e2e tests check the real URLs.
  it("links the brand to the dashboard", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prelegal" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/?$/),
    );
  });

  it("shows the signed-in email", async () => {
    renderHeader();
    expect(await screen.findByText("jane@acme.com")).toBeInTheDocument();
  });

  it("has navigation marking the current page", () => {
    pathname.mockReturnValue("/app/documents/");
    renderHeader();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My documents" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "New document" })).not.toHaveAttribute("aria-current");
  });

  it("treats a path without its trailing slash as the same page", () => {
    pathname.mockReturnValue("/app");
    renderHeader();
    expect(screen.getByRole("link", { name: "New document" })).toHaveAttribute("aria-current", "page");
  });

  it("signs out through the API", async () => {
    const { requests, user } = renderHeader();
    await screen.findByText("jane@acme.com");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(requests.map((r) => `${r.method} ${r.url}`)).toContain("POST /api/auth/signout");
    expect(screen.queryByText("jane@acme.com")).not.toBeInTheDocument();
  });
});
