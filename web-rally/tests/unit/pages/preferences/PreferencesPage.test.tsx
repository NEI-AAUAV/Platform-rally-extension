import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PreferencesPage from "@/pages/preferences";
import { useUserStore } from "@/stores/useUserStore";
import { useTeamAuthStore } from "@/stores/useTeamAuthStore";

vi.mock("@/components/theme", () => ({ AppearanceSettings: () => null }));
vi.mock("@/components/shared", () => ({ PageHeader: () => null }));
vi.mock("@/components/preferences/NotificationSettings", () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));

const signedOut = () => {
  useUserStore.setState({ isAuthenticated: false });
  useTeamAuthStore.setState({ isAuthenticated: false });
};

describe("PreferencesPage notifications", () => {
  afterEach(signedOut);

  it("hides notifications with no session", () => {
    signedOut();
    render(<PreferencesPage />);
    expect(screen.queryByTestId("notification-settings")).toBeNull();
  });

  it("shows notifications to a staff/user session", () => {
    signedOut();
    useUserStore.setState({ isAuthenticated: true });
    render(<PreferencesPage />);
    expect(screen.getByTestId("notification-settings")).toBeTruthy();
  });

  it("shows notifications to a team session", () => {
    signedOut();
    useTeamAuthStore.setState({ isAuthenticated: true });
    render(<PreferencesPage />);
    expect(screen.getByTestId("notification-settings")).toBeTruthy();
  });
});
