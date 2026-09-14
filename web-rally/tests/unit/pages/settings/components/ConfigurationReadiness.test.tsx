import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ConfigurationReadiness from "@/pages/settings/components/ConfigurationReadiness";
import { useEventConfiguration } from "@/pages/settings/components/useEventConfiguration";

vi.mock("@/pages/settings/components/useEventConfiguration", () => ({
  useEventConfiguration: vi.fn(),
}));

function mockConfig(data: unknown, isLoading = false) {
  vi.mocked(useEventConfiguration).mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof useEventConfiguration>);
}

describe("ConfigurationReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while loading", () => {
    mockConfig(undefined, true);
    const { container } = render(<ConfigurationReadiness />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without data", () => {
    mockConfig(undefined, false);
    const { container } = render(<ConfigurationReadiness />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows ready state with no issues", () => {
    mockConfig({
      ready: true,
      issues: [],
      capabilities: {},
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("Configuração pronta")).toBeInTheDocument();
    expect(
      screen.getByText("O formato e os dados necessários para o percurso estão coerentes."),
    ).toBeInTheDocument();
  });

  it("shows incomplete state with error and warning counts", () => {
    mockConfig({
      ready: false,
      issues: [
        { code: "e1", severity: "error", message: "Erro grave", entity_ids: [] },
        { code: "w1", severity: "warning", message: "Aviso leve", entity_ids: [] },
      ],
      capabilities: {},
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("Configuração incompleta")).toBeInTheDocument();
    expect(screen.getByText("1 erro · 1 aviso")).toBeInTheDocument();
    expect(screen.getByText("Erro grave")).toBeInTheDocument();
    expect(screen.getByText("Aviso leve")).toBeInTheDocument();
  });

  it("pluralizes error and warning counts", () => {
    mockConfig({
      ready: false,
      issues: [
        { code: "e1", severity: "error", message: "E1", entity_ids: [] },
        { code: "e2", severity: "error", message: "E2", entity_ids: [] },
        { code: "w1", severity: "warning", message: "W1", entity_ids: [] },
        { code: "w2", severity: "warning", message: "W2", entity_ids: [] },
      ],
      capabilities: {},
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("2 erros · 2 avisos")).toBeInTheDocument();
  });

  it("omits warning segment when there are no warnings", () => {
    mockConfig({
      ready: false,
      issues: [{ code: "e1", severity: "error", message: "E1", entity_ids: [] }],
      capabilities: {},
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("1 erro")).toBeInTheDocument();
  });

  it("shows an info-severity issue with default styling and suggestion", () => {
    mockConfig({
      ready: true,
      issues: [
        {
          code: "i1",
          severity: "info",
          message: "Informação",
          suggestion: "Considere isto",
          entity_ids: [],
        },
      ],
      capabilities: {},
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("Informação")).toBeInTheDocument();
    expect(screen.getByText("Considere isto")).toBeInTheDocument();
  });

  it("renders non-optional capabilities with known labels", () => {
    mockConfig({
      ready: true,
      issues: [],
      capabilities: {
        qr_arrival: { policy: "required", configured: true, effective: true, available: true },
        gps_arrival: { policy: "forbidden", configured: false, effective: false, available: true },
        participant_view: { policy: "optional", configured: false, effective: false, available: true },
      },
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("Check-in QR · Obrigatório")).toBeInTheDocument();
    expect(screen.getByText("Check-in GPS · Indisponível")).toBeInTheDocument();
    // optional capabilities are not "important" and should not render
    expect(screen.queryByText(/Vista de participante/)).not.toBeInTheDocument();
  });

  it("falls back to raw name and policy for unknown capability keys", () => {
    mockConfig({
      ready: true,
      issues: [],
      capabilities: {
        mystery_capability: {
          policy: "custom_policy",
          configured: false,
          effective: false,
          available: true,
        },
      },
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("mystery capability · custom_policy")).toBeInTheDocument();
  });

  it("keys issues by entity ids when present", () => {
    mockConfig({
      ready: false,
      issues: [
        {
          code: "dup",
          severity: "error",
          message: "Duplicado",
          entity_ids: ["a", "b"],
        },
      ],
      capabilities: {},
    });
    render(<ConfigurationReadiness />);
    expect(screen.getByText("Duplicado")).toBeInTheDocument();
  });
});
