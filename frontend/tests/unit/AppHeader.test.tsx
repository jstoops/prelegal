import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppHeader from "@/components/AppHeader";
import { signIn } from "@/lib/session";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());
afterEach(() => sessionStorage.clear());

describe("AppHeader", () => {
  // next/link only keeps trailing slashes when built with trailingSlash: true;
  // the e2e tests check the real URLs.
  it("links the brand to the dashboard", () => {
    render(<AppHeader />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prelegal" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/?$/),
    );
  });

  it("shows the signed-in email", () => {
    signIn("jane@acme.com");
    render(<AppHeader />);
    expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
  });

  it("shows no email when nobody is signed in", () => {
    render(<AppHeader />);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("signs out and returns to the sign-in page", async () => {
    signIn("jane@acme.com");
    const user = userEvent.setup();
    render(<AppHeader />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(push).toHaveBeenCalledWith("/");
    expect(sessionStorage.getItem("prelegal.user")).toBeNull();
    expect(screen.queryByText("jane@acme.com")).not.toBeInTheDocument();
  });
});
