import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthGate from "@/components/AuthGate";
import { AuthProvider } from "@/lib/auth";
import { meRoute, mockApi } from "../fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => replace.mockReset());

function renderGate(require: "user" | "guest", email: string | null) {
  mockApi({ "GET /api/auth/me": meRoute(email) });
  render(
    <AuthProvider>
      <AuthGate require={require}>
        <p>Protected content</p>
      </AuthGate>
    </AuthProvider>,
  );
}

describe("AuthGate", () => {
  it("shows only a loading state until the session is known", () => {
    renderGate("user", "jane@acme.com");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows signed-in users the app", async () => {
    renderGate("user", "jane@acme.com");
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors to sign in", async () => {
    renderGate("user", null);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows signed-out visitors the sign-in page", async () => {
    renderGate("guest", null);
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
  });

  it("sends signed-in users from the sign-in page to the app", async () => {
    renderGate("guest", "jane@acme.com");
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/app/"));
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
