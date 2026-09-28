import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PreparationDashboard from "@/pages/admin/components/dashboard/PreparationDashboard";
import { useEventConfiguration } from "@/pages/settings/components/useEventConfiguration";

vi.mock("@/pages/settings/components/useEventConfiguration", () => ({
  useEventConfiguration: vi.fn(),
}));

type QueryState = { data?: unknown; isLoading: boolean; isError: boolean };
const READY_EMPTY: QueryState = { data: [], isLoading: false, isError: false };
const LOADING: QueryState = { data: undefined, isLoading: true, isError: false };
const FAILED: QueryState = { data: undefined, isLoading: false, isError: true };

const queries = vi.hoisted(() => ({
  byKey: {} as Record<string, { data?: unknown; isLoading: boolean; isError: boolean }>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: [string] }) => queries.byKey[queryKey[0]],
}));

function mockLists(teams: QueryState, checkpoints: QueryState) {
  queries.byKey = { teams, checkpoints };
}

/** The number a stat shows, found through its label. */
function metric(label: string) {
  return screen.getByText(label).closest("[data-status]") as HTMLElement;
}

function mockConfig(data: unknown, extra: Record<string, unknown> = {}) {
  vi.mocked(useEventConfiguration).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useEventConfiguration>);
}

describe("PreparationDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLists(READY_EMPTY, READY_EMPTY);
  });

  it("shows a loading message while the preflight is loading", () => {
    mockConfig(undefined, { isLoading: true });
    render(<PreparationDashboard onNavigate={vi.fn()} />);
    expect(screen.getByText("A verificar configuração do evento…")).toBeInTheDocument();
  });

  it("shows an error message when the preflight request fails", () => {
    mockConfig(undefined, { isError: true });
    render(<PreparationDashboard onNavigate={vi.fn()} />);
    expect(
      screen.getByText("Não foi possível verificar a configuração do evento."),
    ).toBeInTheDocument();
  });

  it("mentions warnings when ready with only warnings", () => {
    mockConfig({
      ready: true,
      issues: [{ code: "NO_ROUTE_STAGES", severity: "warning", message: "Sem etapas" }],
      capabilities: {},
    });
    render(<PreparationDashboard onNavigate={vi.fn()} />);
    expect(screen.getByText("Pronto para começar · 1 aviso")).toBeInTheDocument();
  });

  it("renders an actionable issue that navigates to the mapped tab", () => {
    mockConfig({
      ready: false,
      issues: [{ code: "NO_CHECKPOINTS", severity: "error", message: "Sem postos" }],
      capabilities: {},
    });
    const onNavigate = vi.fn();
    render(<PreparationDashboard onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Corrigir →"));
    expect(onNavigate).toHaveBeenCalledWith({ tabId: "checkpoints" });
  });

  describe("metrics never show a failed or pending request as zero", () => {
    const ZERO_ISSUES = { ready: true, issues: [], capabilities: {} };

    it.each([
      ["Equipas", "teams"],
      ["Postos", "checkpoints"],
    ])("%s shows … while loading", (label, key) => {
      mockConfig(ZERO_ISSUES);
      mockLists(
        key === "teams" ? LOADING : READY_EMPTY,
        key === "checkpoints" ? LOADING : READY_EMPTY,
      );
      render(<PreparationDashboard onNavigate={vi.fn()} />);
      expect(metric(label)).toHaveAttribute("data-status", "loading");
      expect(metric(label)).toHaveTextContent("…");
      expect(metric(label)).not.toHaveTextContent("0");
    });

    it.each([
      ["Equipas", "teams", "as equipas"],
      ["Postos", "checkpoints", "os postos"],
    ])("%s shows — and an alert when its request fails", (label, key, noun) => {
      mockConfig(ZERO_ISSUES);
      mockLists(
        key === "teams" ? FAILED : READY_EMPTY,
        key === "checkpoints" ? FAILED : READY_EMPTY,
      );
      render(<PreparationDashboard onNavigate={vi.fn()} />);
      expect(metric(label)).toHaveAttribute("data-status", "error");
      expect(metric(label)).toHaveTextContent("—");
      expect(metric(label)).not.toHaveTextContent("0");
      expect(screen.getByRole("alert")).toHaveTextContent(`Não foi possível carregar ${noun}.`);
      // The rest of the readiness information stays usable.
      expect(screen.getByText("Configuração pronta")).toBeInTheDocument();
    });

    it("names both lists when both fail", () => {
      mockConfig(ZERO_ISSUES);
      mockLists(FAILED, FAILED);
      render(<PreparationDashboard onNavigate={vi.fn()} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível carregar as equipas nem os postos.",
      );
    });

    it("shows a real 0 for successful empty team and checkpoint lists", () => {
      mockConfig(ZERO_ISSUES);
      render(<PreparationDashboard onNavigate={vi.fn()} />);
      for (const label of ["Equipas", "Postos"]) {
        expect(metric(label)).toHaveAttribute("data-status", "ready");
        expect(metric(label)).toHaveTextContent("0");
      }
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows … for Pontos a verificar while the preflight loads", () => {
      mockConfig(undefined, { isLoading: true });
      render(<PreparationDashboard onNavigate={vi.fn()} />);
      expect(metric("Pontos a verificar")).toHaveAttribute("data-status", "loading");
      expect(metric("Pontos a verificar")).toHaveTextContent("…");
    });

    it("shows — for Pontos a verificar when the preflight fails", () => {
      mockConfig(undefined, { isError: true });
      render(<PreparationDashboard onNavigate={vi.fn()} />);
      expect(metric("Pontos a verificar")).toHaveAttribute("data-status", "error");
      expect(metric("Pontos a verificar")).toHaveTextContent("—");
      expect(metric("Pontos a verificar")).not.toHaveTextContent("0");
      expect(
        screen.getByText("Não foi possível verificar a configuração do evento."),
      ).toBeInTheDocument();
    });

    it("shows a real 0 for Pontos a verificar when the preflight has no issues", () => {
      mockConfig(ZERO_ISSUES);
      render(<PreparationDashboard onNavigate={vi.fn()} />);
      expect(metric("Pontos a verificar")).toHaveAttribute("data-status", "ready");
      expect(metric("Pontos a verificar")).toHaveTextContent("0");
    });
  });
});
