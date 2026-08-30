/**
 * PermissionGuard is an authorization control and was sitting at 0% coverage,
 * because components/shared/** used to be excluded from measurement wholesale.
 * The cases that matter are the negative ones: no scopes, the wrong scopes, and
 * scopes that have not loaded yet must never render the guarded children.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseUser = vi.fn();
vi.mock("@/hooks/useUser", () => ({
  default: () => mockUseUser(),
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));

import PermissionGuard from "@/components/shared/access/PermissionGuard";

const Secret = () => <div>secret content</div>;

describe("PermissionGuard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders children when the user holds one of the required scopes", () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: ["admin"] } });

    render(
      <PermissionGuard>
        <Secret />
      </PermissionGuard>,
    );

    expect(screen.getByText("secret content")).toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
  });

  it("redirects to the fallback when the user holds none of the required scopes", () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: ["some:other"] } });

    render(
      <PermissionGuard>
        <Secret />
      </PermissionGuard>,
    );

    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(screen.getByTestId("redirect")).toHaveTextContent("/scoreboard");
  });

  it("redirects when the user has no scopes at all", () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: undefined } });

    render(
      <PermissionGuard>
        <Secret />
      </PermissionGuard>,
    );

    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(screen.getByTestId("redirect")).toBeInTheDocument();
  });

  it("shows a loading state rather than the children while scopes are still resolving", () => {
    // The dangerous bug here would be rendering children during load and only
    // redirecting once scopes arrive — a visible flash of admin content.
    mockUseUser.mockReturnValue({ isLoading: true, userStore: { scopes: undefined } });

    render(
      <PermissionGuard>
        <Secret />
      </PermissionGuard>,
    );

    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
  });

  it("honours a custom scope list and fallback path", () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: ["staff-rally"] } });

    const { rerender } = render(
      <PermissionGuard requiredScopes={["staff-rally"]} fallbackPath="/postos">
        <Secret />
      </PermissionGuard>,
    );
    expect(screen.getByText("secret content")).toBeInTheDocument();

    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: ["admin"] } });
    rerender(
      <PermissionGuard requiredScopes={["staff-rally"]} fallbackPath="/postos">
        <Secret />
      </PermissionGuard>,
    );
    expect(screen.getByTestId("redirect")).toHaveTextContent("/postos");
  });
});
