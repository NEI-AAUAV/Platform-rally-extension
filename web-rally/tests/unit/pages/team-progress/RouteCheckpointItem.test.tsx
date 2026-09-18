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
  Spinner: () => <div data-testid="spinner" />,
  CheckpointDiscoveryModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="discovery-modal" /> : null,
}));

const checkpoint = {
  id: 1,
  order: 1,
  name: "Posto 1",
  description: "Descrição",
} as DetailedCheckPoint;

// Progress is keyed by checkpoint id. Post 2 is listed first on purpose: the
// lookup must not depend on array position.
const team = {
  checkpoints: [
    {
      checkpoint_id: 2,
      checkpoint_order: 2,
      status: "completed",
      arrived_at: "2024-01-01T11:00:00Z",
      score: 20,
    },
    {
      checkpoint_id: 1,
      checkpoint_order: 1,
      status: "completed",
      arrived_at: "2024-01-01T10:00:00Z",
      score: 10,
    },
  ],
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
        team={{ ...team, checkpoints: [] } as DetailedTeam}
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
        team={{ ...team, checkpoints: [] } as DetailedTeam}
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

  it("renders as skipped, not completed, when the server marks the order as given up", () => {
    const skippedTeam = {
      checkpoints: [
        {
          checkpoint_id: 1,
          checkpoint_order: 1,
          status: "skipped",
          arrived_at: null,
          score: 0,
        },
      ],
    } as DetailedTeam;
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={skippedTeam}
        resolvedOrders={new Set([1])}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Desistiu")).toBeInTheDocument();
    expect(screen.queryByText("Concluído")).not.toBeInTheDocument();
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });

  it("renders as arrived, not completed, when the team has checked in but not scored", () => {
    const arrivedTeam = {
      checkpoints: [
        {
          checkpoint_id: 1,
          checkpoint_order: 1,
          status: "arrived",
          arrived_at: "2024-01-01T10:00:00Z",
          score: 0,
        },
      ],
    } as DetailedTeam;
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={arrivedTeam}
        resolvedOrders={new Set()}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Chegada registada")).toBeInTheDocument();
    expect(screen.queryByText("Concluído")).not.toBeInTheDocument();
  });

  it("falls back to Concluído (not Pendente) when resolvedOrders has the order but no CheckpointProgress detail exists", () => {
    // Regression guard: an older payload can omit `checkpoints` detail
    // entirely. The status derived from resolvedOrders must drive the label
    // too, not just the icon/styling.
    renderWithQueryClient(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={{ checkpoints: [] } as unknown as DetailedTeam}
        resolvedOrders={new Set([1])}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    expect(screen.queryByText("Pendente")).not.toBeInTheDocument();
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
