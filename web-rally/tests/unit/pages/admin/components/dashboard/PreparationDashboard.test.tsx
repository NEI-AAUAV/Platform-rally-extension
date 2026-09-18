import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PreparationDashboard from "@/pages/admin/components/dashboard/PreparationDashboard";
import { useEventConfiguration } from "@/pages/settings/components/useEventConfiguration";

vi.mock("@/pages/settings/components/useEventConfiguration", () => ({
  useEventConfiguration: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));

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
    expect(onNavigate).toHaveBeenCalledWith("checkpoints");
  });
});
