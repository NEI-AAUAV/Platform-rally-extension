import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RouteCheckpointItem from "@/pages/team-progress/RouteCheckpointItem";
import type { DetailedCheckPoint, DetailedTeam } from "@/client";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const { mockUseCheckpointMedia } = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
}));

vi.mock("@/hooks/useCheckpointMedia", () => ({
  useCheckpointMedia: (...args: unknown[]) => mockUseCheckpointMedia(...args),
}));

vi.mock("@/components/shared", () => ({
  CheckpointDiscoveryModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="discovery-modal" /> : null,
}));

const checkpoint = {
  id: 1,
  order: 1,
  name: "Posto 1",
  description: "Descrição",
} as DetailedCheckPoint;

const team = {
  score_per_checkpoint: [10, 20],
  times: ["2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"],
} as DetailedTeam;

describe("RouteCheckpointItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
  });

  it("renders as completed when the server lists the order as resolved", () => {
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        resolvedOrders={new Set([1, 2])}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    expect(screen.getByText("+10 pts")).toBeInTheDocument();
  });

  it("renders as current when the server marks the post reachable", () => {
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={{ ...checkpoint, is_reachable: true } as DetailedCheckPoint}
        index={0}
        team={team}
        resolvedOrders={new Set()}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Em curso")).toBeInTheDocument();
  });

  it("renders as future/pending and locked when the post is redacted and unreachable", () => {
    const futureCheckpoint = {
      ...checkpoint,
      order: 3,
      is_redacted: true,
    } as DetailedCheckPoint;
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={futureCheckpoint}
        index={2}
        team={team}
        resolvedOrders={new Set()}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(screen.getByText(/Descobre este local quando lá chegares/)).toBeInTheDocument();
  });

  it("opens the discovery modal on click when revealable", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        resolvedOrders={new Set([1, 2])}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("discovery-modal")).toBeInTheDocument();
  });

  it("hides score pill when showScore is false", () => {
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        resolvedOrders={new Set([1, 2])}
        showScore={false}
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText("+10 pts")).not.toBeInTheDocument();
  });

  it("renders a cover image header when photos are available", () => {
    mockUseCheckpointMedia.mockReturnValue({
      photos: [{ image_url: "http://x/y.jpg", caption: "Cover" }],
      funFacts: [],
    });
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        resolvedOrders={new Set([1, 2])}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByAltText("Cover")).toBeInTheDocument();
  });
});
