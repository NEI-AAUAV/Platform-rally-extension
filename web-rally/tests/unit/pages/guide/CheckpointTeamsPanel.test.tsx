import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CheckpointTeamsPanel from "@/pages/guide/CheckpointTeamsPanel";

const { mockListTeamsAt, mockGetTeams, mockRecordArrival } = vi.hoisted(() => ({
  mockListTeamsAt: vi.fn(),
  mockGetTeams: vi.fn(),
  mockRecordArrival: vi.fn(),
}));

vi.mock("@/client", () => ({
  listGuideTeamsAtCheckpoint: (...args: unknown[]) => mockListTeamsAt(...args),
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
  recordGuideArrival: (...args: unknown[]) => mockRecordArrival(...args),
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
    mockGetTeams.mockResolvedValue({ data: [] });
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

  it("offers only teams that have not arrived yet", async () => {
    mockListTeamsAt.mockResolvedValue({ data: [arrival({ team_id: 1 })] });
    mockGetTeams.mockResolvedValue({
      data: [
        { id: 1, name: "Os Perdidos" },
        { id: 2, name: "Os Rápidos" },
      ],
    });

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });

    await screen.findByText("Os Perdidos");
    const options = screen.getByRole("combobox");
    expect(options).toHaveTextContent("Os Rápidos");
    expect(options).not.toHaveTextContent(/Marcar chegada de…Os Perdidos/);
  });

  it("marks the chosen team as arrived", async () => {
    mockGetTeams.mockResolvedValue({ data: [{ id: 2, name: "Os Rápidos" }] });

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });
    // The option only exists once the teams query resolves.
    await screen.findByRole("option", { name: "Os Rápidos" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "2");
    await userEvent.click(screen.getByRole("button", { name: /Marcar chegada/ }));

    await waitFor(() =>
      expect(mockRecordArrival).toHaveBeenCalledWith({
        path: { checkpoint_id: 3 },
        body: { team_id: 2 },
      }),
    );
  });

  it("cannot submit without picking a team", async () => {
    mockGetTeams.mockResolvedValue({ data: [{ id: 2, name: "Os Rápidos" }] });

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });

    expect(await screen.findByRole("button", { name: /Marcar chegada/ })).toBeDisabled();
  });

  it("reports a failed arrival", async () => {
    mockGetTeams.mockResolvedValue({ data: [{ id: 2, name: "Os Rápidos" }] });
    mockRecordArrival.mockRejectedValue(new Error("Rally has ended"));

    render(<CheckpointTeamsPanel checkpointId={3} />, { wrapper: createWrapper() });
    await screen.findByRole("option", { name: "Os Rápidos" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "2");
    await userEvent.click(screen.getByRole("button", { name: /Marcar chegada/ }));

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
