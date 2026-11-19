import { render, screen } from "@testing-library/react";
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

vi.mock("@/components/preferences/TeamNotificationPrompt", () => ({
  TeamNotificationPrompt: () => null,
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

vi.mock("@/pages/team-progress/RouteFinishedCard", () => ({
  default: () => <div data-testid="route-finished" />,
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

  describe("focused route", () => {
    const focused = {
      participant_view_enabled: true,
      show_checkpoint_map: true,
      show_route_mode: "focused",
      event_type: "rally_tascas",
    };

    it("closes the route list with a '?' row when posts are withheld", () => {
      mockUseTeamProgress.mockReturnValue({ ...baseHookReturn, settings: focused, totalCount: 5 });
      render(<TeamProgress />);
      const row = screen.getByRole("listitem", { name: "Mais tascas por revelar" });
      expect(row).toHaveTextContent("?");
      expect(row).toHaveTextContent(
        "As restantes tascas revelam-se à medida que o percurso decorre.",
      );
    });

    it("has no '?' row once every post is listed", () => {
      mockUseTeamProgress.mockReturnValue({ ...baseHookReturn, settings: focused, totalCount: 2 });
      render(<TeamProgress />);
      expect(screen.queryByText("Mais tascas por revelar")).not.toBeInTheDocument();
    });

    it("has no '?' row after the route is finished", () => {
      mockUseTeamProgress.mockReturnValue({
        ...baseHookReturn,
        settings: focused,
        totalCount: 5,
        isRouteFinished: true,
        nextCheckpoint: undefined,
      });
      render(<TeamProgress />);
      expect(screen.queryByText("Mais tascas por revelar")).not.toBeInTheDocument();
    });

    it("has no '?' row on a complete route", () => {
      mockUseTeamProgress.mockReturnValue({
        ...baseHookReturn,
        settings: { ...focused, show_route_mode: "complete" },
        totalCount: 5,
      });
      render(<TeamProgress />);
      expect(screen.queryByText("Mais tascas por revelar")).not.toBeInTheDocument();
    });
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

    it("shows the current post and the route in one scroll, without tabs", () => {
      render(<TeamProgress />);
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.getByTestId("next-checkpoint")).toBeInTheDocument();
      expect(screen.getByTestId("route-item-0")).toBeInTheDocument();
    });

    it("shows the map between the current post and the route", () => {
      render(<TeamProgress />);
      const next = screen.getByTestId("next-checkpoint");
      const map = screen.getByTestId("map-section");
      const route = screen.getByTestId("route-item-0");
      expect(next.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(map.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("still hides the map when show_checkpoint_map is false", () => {
      mockUseTeamProgress.mockReturnValue({
        ...baseHookReturn,
        settings: { participant_view_enabled: true, show_checkpoint_map: false },
      });
      render(<TeamProgress />);
      expect(screen.queryByTestId("map-section")).not.toBeInTheDocument();
    });

    it("leaves the team details to their bottom-nav page", () => {
      render(<TeamProgress />);
      expect(screen.queryByTestId("members-card")).not.toBeInTheDocument();
      expect(screen.queryByTestId("details-card")).not.toBeInTheDocument();
    });
  });
});
