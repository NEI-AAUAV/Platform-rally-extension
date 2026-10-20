import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TeamProgress from "@/pages/team-progress/index";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";

const { mockUseTeamProgress, mockUseTeamNotifications, mockIsDesktop } = vi.hoisted(() => ({
  mockUseTeamProgress: vi.fn(),
  mockUseTeamNotifications: vi.fn(),
  mockIsDesktop: vi.fn(() => true),
}));

vi.mock("@/pages/team-progress/useIsDesktop", () => ({
  useIsDesktop: () => mockIsDesktop(),
}));

vi.mock("@/pages/team-progress/useTeamProgress", () => ({
  useTeamProgress: () => mockUseTeamProgress(),
}));

vi.mock("@/hooks/useTeamNotifications", () => ({
  default: (...args: unknown[]) => mockUseTeamNotifications(...args),
}));

vi.mock("@/pages/team-progress/StatusScreen", () => ({
  default: ({ title }: { title: string }) => <div data-testid="status-screen">{title}</div>,
}));

vi.mock("@/pages/team-progress/TeamProgressSkeleton", () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock("@/pages/team-progress/TeamStatusBar", () => ({
  default: () => <div data-testid="header-card" />,
}));

vi.mock("@/pages/team-progress/TeamDetailsCard", () => ({
  default: () => <div data-testid="details-card" />,
}));

vi.mock("@/pages/team-progress/TeamMembersCard", () => ({
  default: () => <div data-testid="members-card" />,
}));

vi.mock("@/pages/team-progress/NextCheckpointCard", () => ({
  default: () => <div data-testid="next-checkpoint" />,
}));

vi.mock("@/pages/team-progress/RouteCheckpointItem", () => ({
  default: ({ index }: { index: number }) => <div data-testid={`route-item-${index}`} />,
}));

vi.mock("@/pages/checkpoints/components/MapSection", () => ({
  default: () => <div data-testid="map-section" />,
}));

const team = {
  name: "Team A",
  total: 30,
  last_checkpoint_number: 1,
} as DetailedTeam;
const checkpoints = [
  { id: 1, order: 1, name: "Posto 1" },
  { id: 2, order: 2, name: "Posto 2" },
] as DetailedCheckPoint[];

const baseHookReturn = {
  settings: { participant_view_enabled: true, show_checkpoint_map: true },
  team,
  checkpoints,
  isLoading: false,
  teamError: null,
  expandedCheckpoints: new Set<number>(),
  toggleCheckpoint: vi.fn(),
  completedCheckpointsCount: 1,
  nextCheckpoint: checkpoints[1],
  showScore: true,
  showRanking: true,
  totalCount: 2,
};

describe("TeamProgress page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDesktop.mockReturnValue(true);
    window.history.replaceState(null, "", "/");
    mockUseTeamProgress.mockReturnValue(baseHookReturn);
  });

  it("shows the skeleton while loading", () => {
    mockUseTeamProgress.mockReturnValue({ ...baseHookReturn, isLoading: true });
    render(<TeamProgress />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("shows a disabled-view status screen when participant view is disabled", () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      settings: { participant_view_enabled: false },
    });
    render(<TeamProgress />);
    expect(screen.getByTestId("status-screen")).toHaveTextContent("Vista não disponível");
  });

  it("shows an error status screen when teamError is set", () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      teamError: new Error("fail"),
    });
    render(<TeamProgress />);
    expect(screen.getByTestId("status-screen")).toHaveTextContent("Erro ao carregar");
  });

  it("shows an error status screen when team is missing", () => {
    mockUseTeamProgress.mockReturnValue({ ...baseHookReturn, team: undefined });
    render(<TeamProgress />);
    expect(screen.getByTestId("status-screen")).toHaveTextContent("Erro ao carregar");
  });

  it("renders the full progress layout on success", () => {
    render(<TeamProgress />);
    expect(screen.getByTestId("header-card")).toBeInTheDocument();
    expect(screen.getByTestId("members-card")).toBeInTheDocument();
    expect(screen.getByTestId("map-section")).toBeInTheDocument();
    expect(screen.getByTestId("next-checkpoint")).toBeInTheDocument();
    expect(screen.getByTestId("route-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("route-item-1")).toBeInTheDocument();
    expect(screen.getByText("Percurso")).toBeInTheDocument();
  });

  it("hides the map when show_checkpoint_map is false", () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      settings: { participant_view_enabled: true, show_checkpoint_map: false },
    });
    render(<TeamProgress />);
    expect(screen.queryByTestId("map-section")).not.toBeInTheDocument();
  });

  it("does not render the route section when there are no checkpoints", () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      checkpoints: [],
      nextCheckpoint: undefined,
    });
    render(<TeamProgress />);
    expect(screen.queryByText("Percurso")).not.toBeInTheDocument();
    expect(screen.queryByTestId("next-checkpoint")).not.toBeInTheDocument();
  });

  it("does not show a free-choice notice for a single open checkpoint", () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      openCheckpointOrders: [2],
      hasFreeChoice: false,
    });
    render(<TeamProgress />);
    expect(screen.queryByText(/postos disponíveis/)).not.toBeInTheDocument();
  });

  it("shows a free-choice notice when several checkpoints are open at once", () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      openCheckpointOrders: [2, 3, 4],
      hasFreeChoice: true,
    });
    render(<TeamProgress />);
    expect(screen.getByText(/3 .* disponíveis/)).toBeInTheDocument();
  });

  describe("on a phone", () => {
    beforeEach(() => mockIsDesktop.mockReturnValue(false));

    it("shows one tab at a time, starting on Agora", () => {
      render(<TeamProgress />);
      expect(screen.getByRole("tab", { name: "Agora" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("next-checkpoint")).toBeInTheDocument();
      expect(screen.queryByTestId("route-item-0")).not.toBeInTheDocument();
      expect(screen.queryByTestId("map-section")).not.toBeInTheDocument();
    });

    it("switches panels and records the tab in the URL", async () => {
      const user = userEvent.setup();
      render(<TeamProgress />);
      await user.click(screen.getByRole("tab", { name: /Percurso/ }));
      expect(screen.getByTestId("route-item-0")).toBeInTheDocument();
      expect(screen.queryByTestId("next-checkpoint")).not.toBeInTheDocument();
      expect(window.location.search).toBe("?tab=percurso");
    });

    it("opens on the tab named in the URL", () => {
      window.history.replaceState(null, "", "/?tab=equipa");
      render(<TeamProgress />);
      expect(screen.getByTestId("members-card")).toBeInTheDocument();
    });

    it("omits the map tab when the map is off", () => {
      mockUseTeamProgress.mockReturnValue({
        ...baseHookReturn,
        settings: { participant_view_enabled: true, show_checkpoint_map: false },
      });
      render(<TeamProgress />);
      expect(screen.queryByRole("tab", { name: "Mapa" })).not.toBeInTheDocument();
    });

    it("moves between tabs with the arrow keys", async () => {
      const user = userEvent.setup();
      render(<TeamProgress />);
      screen.getByRole("tab", { name: "Agora" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: /Percurso/ })).toHaveFocus();
      expect(screen.getByRole("tab", { name: /Percurso/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });
});
