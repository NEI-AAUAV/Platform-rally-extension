import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DeferredJudgingTab from "./DeferredJudgingTab";

const mockListPendingJudgments = vi.fn();
const mockListDeferredResultsForActivity = vi.fn();
const mockGetActivities = vi.fn();
const mockRankDeferredResults = vi.fn();

vi.mock("@/client", () => ({
  listPendingJudgments: (...args: unknown[]) => mockListPendingJudgments(...args),
  listDeferredResultsForActivity: (...args: unknown[]) =>
    mockListDeferredResultsForActivity(...args),
  getActivities: (...args: unknown[]) => mockGetActivities(...args),
  rankDeferredResults: (...args: unknown[]) => mockRankDeferredResults(...args),
}));

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DeferredJudgingTab />
    </QueryClientProvider>,
  );
}

const result = (id: number, teamId: number) => ({
  id,
  activity_id: 42,
  team_id: teamId,
  judgment_status: "pending_judgment",
  media_urls: [],
  final_score: null,
  is_completed: true,
});

const judged = (id: number, teamId: number, score: number) => ({
  ...result(id, teamId),
  judgment_status: "judged",
  final_score: score,
});

describe("DeferredJudgingTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActivities.mockResolvedValue({
      data: { activities: [{ id: 42, name: "Foto Criativa" }] },
    });
    mockRankDeferredResults.mockResolvedValue({ data: [] });
    // Default: the full field matches what is pending. Tests that care about
    // the difference override it.
    mockListDeferredResultsForActivity.mockImplementation(async () => ({
      data: [result(1, 100), result(2, 200)],
    }));
  });

  it("shows the empty state when there is nothing pending", async () => {
    mockListPendingJudgments.mockResolvedValue({ data: [] });
    renderWithClient();
    expect(await screen.findByText("Sem julgamentos pendentes")).toBeInTheDocument();
  });

  it("groups pending captures by activity and shows team entries in order", async () => {
    mockListPendingJudgments.mockResolvedValue({
      data: [result(1, 100), result(2, 200)],
    });
    renderWithClient();

    expect(await screen.findByText("Foto Criativa")).toBeInTheDocument();
    // The entries come from the per-activity query, which resolves after the
    // group header the pending list alone can render.
    expect(await screen.findByText("Equipa #100")).toBeInTheDocument();
    expect(screen.getByText("Equipa #200")).toBeInTheDocument();
  });

  it("reorders entries with the up/down controls before submitting", async () => {
    const user = userEvent.setup();
    mockListPendingJudgments.mockResolvedValue({
      data: [result(1, 100), result(2, 200)],
    });
    renderWithClient();

    await screen.findByText("Equipa #200");
    await user.click(screen.getByLabelText("Subir equipa #200"));

    const teamLabels = screen.getAllByText(/^Equipa #/).map((el) => el.textContent);
    expect(teamLabels).toEqual(["Equipa #200", "Equipa #100"]);

    await user.click(screen.getByText("Confirmar ordenação"));

    await waitFor(() =>
      expect(mockRankDeferredResults).toHaveBeenCalledWith({
        path: { activity_id: 42 },
        body: { ordered_result_ids: [2, 1] },
      }),
    );
  });

  it("ranks the whole field, not just what is still pending", async () => {
    const user = userEvent.setup();
    // One capture was judged individually earlier, so it is absent from the
    // pending list — but the ranking must still cover it, or the server
    // rejects the submission and the remaining ones get re-scaled over the
    // full range behind the judge's back.
    mockListPendingJudgments.mockResolvedValue({ data: [result(1, 100)] });
    mockListDeferredResultsForActivity.mockResolvedValue({
      data: [result(1, 100), judged(2, 200, 80)],
    });
    renderWithClient();

    expect(await screen.findByText("Equipa #200")).toBeInTheDocument();
    expect(screen.getByText(/já julgada: 80/)).toBeInTheDocument();

    await user.click(screen.getByText("Confirmar ordenação"));

    await waitFor(() =>
      expect(mockRankDeferredResults).toHaveBeenCalledWith({
        path: { activity_id: 42 },
        body: { ordered_result_ids: [1, 2] },
      }),
    );
  });

  it("shows an error message when submitting the ranking fails", async () => {
    const user = userEvent.setup();
    mockListPendingJudgments.mockResolvedValue({ data: [result(1, 100)] });
    mockListDeferredResultsForActivity.mockResolvedValue({ data: [result(1, 100)] });
    mockRankDeferredResults.mockRejectedValue(new Error("boom"));
    renderWithClient();

    await screen.findByText("Equipa #100");
    await user.click(screen.getByText("Confirmar ordenação"));

    expect(await screen.findByText(/Erro ao submeter a ordenação/)).toBeInTheDocument();
  });
});
