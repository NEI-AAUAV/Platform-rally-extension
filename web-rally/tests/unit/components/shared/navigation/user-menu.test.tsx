import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserMenu } from "@/components/shared/navigation/user-menu";

const { mockLogout } = vi.hoisted(() => ({ mockLogout: vi.fn() }));

vi.mock("@/stores/useUserStore", () => ({
  useUserStore: (select: (s: unknown) => unknown) =>
    select({
      isAuthenticated: true,
      name: "Ana Silva",
      email: "ana@example.com",
      image: undefined,
      scopes: [],
      sessionLoading: false,
    }),
}));
vi.mock("@/hooks/useTeamAuth", () => ({
  default: () => ({ isAuthenticated: false, teamData: null, logout: vi.fn() }),
}));
vi.mock("@/hooks/useLoginLink", () => ({ default: () => vi.fn() }));
vi.mock("@/auth/useLogout", () => ({ useLogout: () => mockLogout }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("UserMenu account menu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes a labelled trigger that toggles the menu on click/tap", async () => {
    render(<UserMenu />);
    const trigger = screen.getByRole("button", { name: /menu da conta/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /o meu perfil/i })).toBeVisible();
  });

  it("is reachable and dismissable by keyboard", async () => {
    render(<UserMenu />);
    await userEvent.tab();
    const trigger = screen.getByRole("button", { name: /menu da conta/i });
    expect(trigger).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("signs out from the menu", async () => {
    render(<UserMenu />);
    await userEvent.click(screen.getByRole("button", { name: /menu da conta/i }));
    await userEvent.click(screen.getByRole("button", { name: /terminar sessão/i }));
    expect(mockLogout).toHaveBeenCalled();
  });
});
