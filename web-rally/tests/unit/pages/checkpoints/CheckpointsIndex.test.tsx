import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Checkpoints from "@/pages/checkpoints/index";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const {
  mockGetCheckpointsCount,
  mockGetCheckpoints,
  mockUseRallySettings, mockUseTeamAuth, mockUseUserStore } = vi.hoisted(
  () => ({
    mockGetCheckpoints: vi.fn(),
    mockGetCheckpointsCount: vi.fn(),
    mockUseRallySettings: vi.fn(),
    mockUseTeamAuth: vi.fn(),
    mockUseUserStore: vi.fn(),
  }),
);

vi.mock("@/client", () => ({
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
  getCheckpointsCount: (...args: unknown[]) => mockGetCheckpointsCount(...args),
}));

vi.mock("@/hooks/useRallySettings", () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock("@/hooks/useEventTerms", () => ({
  default: () => ({ event: "rally", checkpoint: "posto", checkpoints: "postos" }),
}));

vi.mock("@/hooks/useTeamAuth", () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock("@/components/shared", () => ({
  Spinner: () => <div data-testid="spinner" />,
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/stores/useUserStore", () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector(mockUseUserStore()),
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

vi.mock("@/pages/checkpoints/components", () => ({
  CheckpointList: ({
    checkpoints,
    hasHiddenCheckpoints,
  }: {
    checkpoints: { id: number; name: string }[];
    hasHiddenCheckpoints?: boolean;
  }) => (
    <div>
      CheckpointList: {checkpoints.map((c) => c.name).join(", ")}
      {hasHiddenCheckpoints && <span>has-hidden</span>}
    </div>
  ),
  MapSection: () => <div>MapSection</div>,
}));

describe("Checkpoints index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({ settings: { show_checkpoint_map: true } });
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false });
    mockUseUserStore.mockReturnValue({ scopes: [] });
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    mockGetCheckpointsCount.mockResolvedValue({ data: 0 });
  });

  it("redirects team users when checkpoint map is not public and user unprivileged", () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_checkpoint_map: false } });
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true });
    mockUseUserStore.mockReturnValue({ scopes: [] });
    renderWithClient(<Checkpoints />);
    expect(screen.getByText("Navigate to /team-progress")).toBeInTheDocument();
  });

  it("shows loading state while fetching checkpoints", () => {
    mockGetCheckpoints.mockReturnValue(new Promise(() => {}));
    renderWithClient(<Checkpoints />);
    expect(screen.getByText("A carregar postos...")).toBeInTheDocument();
  });

  it("renders sorted checkpoints once loaded", async () => {
    mockGetCheckpoints.mockResolvedValue({
      data: [
        { id: 2, name: "Second", order: 2 },
        { id: 1, name: "First", order: 1 },
      ],
    });
    renderWithClient(<Checkpoints />);
    await waitFor(() => {
      expect(screen.getByText("CheckpointList: First, Second")).toBeInTheDocument();
    });
  });

  it("allows privileged staff to see postos even when map is not public", async () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_checkpoint_map: false } });
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true });
    mockUseUserStore.mockReturnValue({ scopes: ["rally-staff"] });
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    renderWithClient(<Checkpoints />);
    await waitFor(() => {
      expect(screen.getByText("CheckpointList:")).toBeInTheDocument();
    });
  });

  describe("withheld posts placeholder", () => {
    const oneOpen = { data: [{ id: 1, name: "Meia-Lua", order: 1 }] };

    beforeEach(() => {
      mockUseTeamAuth.mockReturnValue({ isAuthenticated: true });
      mockGetCheckpoints.mockResolvedValue(oneOpen);
      mockGetCheckpointsCount.mockResolvedValue({ data: 5 });
    });

    it("flags hidden posts for a team on a focused route", async () => {
      mockUseRallySettings.mockReturnValue({
        settings: { show_checkpoint_map: true, show_route_mode: "focused" },
      });
      renderWithClient(<Checkpoints />);
      await waitFor(() => expect(screen.getByText("has-hidden")).toBeInTheDocument());
    });

    it("does not flag on a complete route", async () => {
      mockUseRallySettings.mockReturnValue({
        settings: { show_checkpoint_map: true, show_route_mode: "complete" },
      });
      renderWithClient(<Checkpoints />);
      await waitFor(() => expect(screen.getByText(/Meia-Lua/)).toBeInTheDocument());
      expect(screen.queryByText("has-hidden")).not.toBeInTheDocument();
      expect(mockGetCheckpointsCount).not.toHaveBeenCalled();
    });

    it("does not flag once every post is listed", async () => {
      mockUseRallySettings.mockReturnValue({
        settings: { show_checkpoint_map: true, show_route_mode: "focused" },
      });
      mockGetCheckpointsCount.mockResolvedValue({ data: 1 });
      renderWithClient(<Checkpoints />);
      await waitFor(() => expect(mockGetCheckpointsCount).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByText(/Meia-Lua/)).toBeInTheDocument());
      expect(screen.queryByText("has-hidden")).not.toBeInTheDocument();
    });

    it("does not flag for privileged staff", async () => {
      mockUseRallySettings.mockReturnValue({
        settings: { show_checkpoint_map: true, show_route_mode: "focused" },
      });
      mockUseUserStore.mockReturnValue({ scopes: ["rally-staff"] });
      renderWithClient(<Checkpoints />);
      await waitFor(() => expect(screen.getByText(/Meia-Lua/)).toBeInTheDocument());
      expect(screen.queryByText("has-hidden")).not.toBeInTheDocument();
      expect(mockGetCheckpointsCount).not.toHaveBeenCalled();
    });
  });
});
