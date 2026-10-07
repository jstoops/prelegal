import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginForm from "@/components/LoginForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());
afterEach(() => sessionStorage.clear());

describe("LoginForm", () => {
  it("has a heading and labelled email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByText(/any email and password will sign you in/i)).toBeInTheDocument();
  });

  it("signs in with any credentials and goes to the dashboard", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "jane@acme.com");
    await user.type(screen.getByLabelText("Password"), "anything");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(push).toHaveBeenCalledWith("/app/");
    expect(sessionStorage.getItem("prelegal.user")).toBe("jane@acme.com");
  });

  it("submits with Enter", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "jane@acme.com");
    await user.type(screen.getByLabelText("Password"), "pw{Enter}");
    expect(push).toHaveBeenCalledWith("/app/");
  });

  it("requires both fields", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(push).not.toHaveBeenCalled();
  });
});
