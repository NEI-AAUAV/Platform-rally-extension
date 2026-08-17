/**
 * RouteStageManager had no coverage of any kind — 0% unit, and no e2e spec
 * names it (the traceability gate is satisfied by the checkpoints tab that
 * contains it). Stages decide the order posts are visited in and how many of
 * them a team must complete before the next block opens, so a mistake here
 * either blocks a route mid-rally or lets teams skip posts that should count.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockList, mockCreate, mockUpdate, mockDelete, mockToast } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/client", () => ({
  listRouteStages: (...a: unknown[]) => mockList(...a),
  createRouteStage: (...a: unknown[]) => mockCreate(...a),
  updateRouteStage: (...a: unknown[]) => mockUpdate(...a),
  deleteRouteStage: (...a: unknown[]) => mockDelete(...a),
}));

vi.mock("@/hooks/use-toast", () => ({ useAppToast: () => mockToast }));

import RouteStageManager from "@/pages/admin/components/checkpoints/RouteStageManager";

const stage = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Universidade",
  order: 1,
  order_matters: true,
  required_count: null,
  checkpoint_ids: [10, 11, 12],
  ...over,
});

function renderManager(onChanged = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouteStageManager onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return { onChanged };
}

describe("RouteStageManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ data: [stage()] });
    mockCreate.mockResolvedValue({ data: {} });
    mockUpdate.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it("lists each stage with its order and post count", async () => {
    renderManager();

    expect(await screen.findByText("Universidade")).toBeInTheDocument();
    expect(screen.getByText("3 posto(s)")).toBeInTheDocument();
  });

  it("explains that a route with no stages runs as a single block", async () => {
    mockList.mockResolvedValue({ data: [] });

    renderManager();

    expect(
      await screen.findByText("Sem etapas — a rota corre como um bloco único."),
    ).toBeInTheDocument();
  });

  it("tolerates a non-array payload rather than crashing the tab", async () => {
    mockList.mockResolvedValue({ data: null });

    renderManager();

    expect(await screen.findByText(/Sem etapas/)).toBeInTheDocument();
  });

  it("appends a new stage after the existing ones", async () => {
    renderManager();
    await screen.findByText("Universidade");

    fireEvent.change(screen.getByLabelText("Nome da nova etapa"), { target: { value: "Bares" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar etapa" }));

    await waitFor(() =>
      // order must follow the existing stage, not collide with it
      expect(mockCreate).toHaveBeenCalledWith({
        body: { name: "Bares", order: 2, order_matters: true, required_count: null },
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith("Etapa criada");
  });

  it("trims the typed name and refuses a whitespace-only one", async () => {
    renderManager();
    await screen.findByText("Universidade");

    const input = screen.getByLabelText("Nome da nova etapa");
    const button = screen.getByRole("button", { name: "Adicionar etapa" });

    fireEvent.change(input, { target: { value: "   " } });
    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: "  Bares  " } });
    fireEvent.click(button);

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({ name: "Bares" }),
      })),
    );
  });

  it("toggles whether the stage's posts must be visited in order", async () => {
    const { onChanged } = renderManager();
    await screen.findByText("Universidade");

    fireEvent.click(screen.getByLabelText("Postos desta etapa por ordem"));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ path: { id: 1 }, body: { order_matters: false } }),
    );
    // The route list has to refetch: stage order decides post order.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("saves a required count so a team can complete 3 of 5", async () => {
    renderManager();
    await screen.findByText("Universidade");

    const input = screen.getByLabelText("Quantos postos contam para avançar");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ path: { id: 1 }, body: { required_count: 3 } }),
    );
  });

  it("clears the required count back to null when emptied, meaning all posts", async () => {
    mockList.mockResolvedValue({ data: [stage({ required_count: 3 })] });

    renderManager();
    await screen.findByText("Universidade");

    const input = screen.getByLabelText("Quantos postos contam para avançar");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    // Sending 0 instead of null would mean "no posts required" — a very
    // different rule from "all of them".
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ path: { id: 1 }, body: { required_count: null } }),
    );
  });

  it("deletes a stage and says the posts were left without one", async () => {
    renderManager();
    await screen.findByText("Universidade");

    fireEvent.click(screen.getByRole("button", { name: "Apagar etapa Universidade" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith({ path: { id: 1 } }));
    expect(mockToast.success).toHaveBeenCalledWith(
      "Etapa apagada — os postos ficaram sem etapa",
    );
  });

  it("surfaces a failed create as an error toast", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));

    renderManager();
    await screen.findByText("Universidade");

    fireEvent.change(screen.getByLabelText("Nome da nova etapa"), { target: { value: "Bares" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar etapa" }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });
});
