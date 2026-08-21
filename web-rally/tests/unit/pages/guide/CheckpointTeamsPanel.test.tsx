import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CheckpointTeamsPanel from "@/pages/guide/CheckpointTeamsPanel";

const { mockListTeamsAt, mockGetGuideTeam, mockRecordArrival } = vi.hoisted(() => ({
  mockListTeamsAt: vi.fn(),
  mockGetGuideTeam: vi.fn(),
  mockRecordArrival: vi.fn(),
}));

vi.mock("@/client", () => ({
  listGuideTeamsAtCheckpoint: (...args: unknown[]) => mockListTeamsAt(...args),
  getGuideTeam: (...args: unknown[]) => mockGetGuideTeam(...args),
  recordGuideArrival: (...args: unknown[]) => mockRecordArrival(...args),
}));

vi.mock("@/hooks/useRallySettings", () => ({
  default: () => ({ settings: { guide_manual_arrival_enabled: true } }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const arrival = (overrides: Record<string, unknown> = {}) => ({
  team_id: 1,
  team_name: "Os Perdidos",
  arrived_at: "2026-08-07T14:20:00Z",
  arrived_by_guide: false,
  revealed_indication_ids: [],
  ...overrides,
});

describe("CheckpointTeamsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTeamsAt.mockResolvedValue({ data: [] });
    mockGetGuideTeam.mockResolvedValue({ data: { id: 2, name: "Os Rápidos" } });
    mockRecordArrival.mockResolvedValue({ data: { already_registered: false } });
  });

  it("says so when nobody has arrived", async () => {
    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });

    expect(await screen.findByText(/Ainda não chegou nenhuma equipa/)).toBeInTheDocument();
  });

  it("lists who arrived and flags hints they already bought", async () => {
    mockListTeamsAt.mockResolvedValue({
      data: [arrival({ revealed_indication_ids: [7, 8], arrived_by_guide: true })],
    });

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });

    expect(await screen.findByText("Os Perdidos")).toBeInTheDocument();
    // Reading those out again would hand back what the team paid for.
    expect(screen.getByText(/2 pistas já compradas/)).toBeInTheDocument();
    expect(screen.getByText(/manual/)).toBeInTheDocument();
  });

  it("offers to mark arrival only for the guide's own team", async () => {
    mockListTeamsAt.mockResolvedValue({ data: [arrival({ team_id: 1 })] });
    mockGetGuideTeam.mockResolvedValue({ data: { id: 2, name: "Os Rápidos" } });

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });

    await screen.findByText("Os Perdidos");
    expect(
      await screen.findByRole("button", { name: /Marcar chegada de Os Rápidos/ }),
    ).toBeInTheDocument();
  });

  it("marks the guide's own team as arrived", async () => {
    mockGetGuideTeam.mockResolvedValue({ data: { id: 2, name: "Os Rápidos" } });

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(
      await screen.findByRole("button", { name: /Marcar chegada de Os Rápidos/ }),
    );

    await waitFor(() =>
      expect(mockRecordArrival).toHaveBeenCalledWith({
        path: { checkpoint_id: 3 },
        body: { team_id: 2 },
      }),
    );
  });

  it("hides the arrival button once the guide's own team already arrived", async () => {
    mockGetGuideTeam.mockResolvedValue({ data: { id: 2, name: "Os Rápidos" } });
    mockListTeamsAt.mockResolvedValue({ data: [arrival({ team_id: 2, team_name: "Os Rápidos" })] });

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });

    await screen.findByText("Os Rápidos");
    expect(screen.queryByRole("button", { name: /Marcar chegada/ })).not.toBeInTheDocument();
  });

  it("reports a failed arrival", async () => {
    mockGetGuideTeam.mockResolvedValue({ data: { id: 2, name: "Os Rápidos" } });
    mockRecordArrival.mockRejectedValue(new Error("Rally has ended"));

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(
      await screen.findByRole("button", { name: /Marcar chegada de Os Rápidos/ }),
    );

    expect(await screen.findByText(/Rally has ended/)).toBeInTheDocument();
  });

  it("reports purchased indication ids upward", async () => {
    mockListTeamsAt.mockResolvedValue({
      data: [
        arrival({ revealed_indication_ids: [7] }),
        arrival({ team_id: 2, revealed_indication_ids: [9] }),
      ],
    });
    const onPurchasedIdsChange = vi.fn();

    render(<CheckpointTeamsPanel checkpointId={3} onPurchasedIdsChange={onPurchasedIdsChange} />, {
      wrapper: createWrapper(),
    });

    // The indication list above uses this to flag rungs already paid for.
    await waitFor(() => expect(onPurchasedIdsChange).toHaveBeenCalledWith([7, 9]));
  });
});
