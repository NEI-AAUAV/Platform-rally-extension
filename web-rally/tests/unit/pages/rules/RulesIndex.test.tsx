import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Rules from "@/pages/rules/index";

const { mockUseRallySettings } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
}));

vi.mock("@/hooks/useRallySettings", () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock("@/components/shared", () => ({
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe("Rules index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({ settings: {} });
  });

  it('renders the "how it works" section open by default', () => {
    render(<Rules />);
    expect(screen.getByText("Regras & FAQ")).toBeInTheDocument();
    expect(screen.getByText(/Cada equipa percorre os postos do rally/)).toBeInTheDocument();
  });

  it("toggles a section open/closed on click", async () => {
    const user = userEvent.setup();
    render(<Rules />);
    const scoreButton = screen.getByRole("button", { name: /Pontuação/i });
    expect(scoreButton).toHaveAttribute("aria-expanded", "false");
    await user.click(scoreButton);
    expect(scoreButton).toHaveAttribute("aria-expanded", "true");

    const howButton = screen.getByRole("button", { name: /Como funciona/i });
    expect(howButton).toHaveAttribute("aria-expanded", "false");
    await user.click(howButton);
    expect(howButton).toHaveAttribute("aria-expanded", "true");
    expect(scoreButton).toHaveAttribute("aria-expanded", "false");
  });

  it("shows versus section only when enable_versus is true", () => {
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: true } });
    render(<Rules />);
    expect(screen.getByRole("button", { name: /Modo Versus/i })).toBeInTheDocument();
  });

  it("hides versus section when enable_versus is false", () => {
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: false } });
    render(<Rules />);
    expect(screen.queryByRole("button", { name: /Modo Versus/i })).not.toBeInTheDocument();
  });

  it("shows tasca mechanics bonus/penalty text when configured", async () => {
    mockUseRallySettings.mockReturnValue({
      settings: {
        bonus_per_extra_shot: 5,
        max_extra_shots_per_member: 3,
        penalty_per_puke: -10,
        penalty_per_not_drinking: -5,
      },
    });
    const user = userEvent.setup();
    render(<Rules />);
    await user.click(screen.getByRole("button", { name: /Pontuação/i }));
    expect(screen.getByText(/por cada shot extra/)).toBeInTheDocument();
    expect(screen.getByText(/por cada vómito/)).toBeInTheDocument();
    expect(screen.getByText(/por cada membro que não bebe/)).toBeInTheDocument();
  });

  it("reflects checkpoint order setting text", async () => {
    mockUseRallySettings.mockReturnValue({ settings: { checkpoint_order_matters: true } });
    render(<Rules />);
    expect(
      screen.getByText("Os postos devem ser visitados pela ordem definida."),
    ).toBeInTheDocument();
  });

  it('shows the "any order" text when checkpoint_order_matters is false', () => {
    mockUseRallySettings.mockReturnValue({ settings: { checkpoint_order_matters: false } });
    render(<Rules />);
    expect(
      screen.getByText("Os postos podem ser visitados por qualquer ordem."),
    ).toBeInTheDocument();
  });

  it("shows the hidden-leaderboard notice when show_live_leaderboard is false", async () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_live_leaderboard: false } });
    const user = userEvent.setup();
    render(<Rules />);
    await user.click(screen.getByRole("button", { name: /Pontuação/i }));
    expect(
      screen.getByText(/mas o leaderboard ao vivo pode estar oculto pelo organizador/),
    ).toBeInTheDocument();
  });

  it("handles missing settings gracefully", () => {
    mockUseRallySettings.mockReturnValue({ settings: undefined });
    render(<Rules />);
    expect(screen.getByText("Regras & FAQ")).toBeInTheDocument();
  });

  it("renders an admin override instead of the default copy when set", () => {
    mockUseRallySettings.mockReturnValue({
      settings: { rules_content: { how: "Texto personalizado pelo organizador." } },
    });
    render(<Rules />);
    expect(screen.getByText("Texto personalizado pelo organizador.")).toBeInTheDocument();
    expect(screen.queryByText(/Cada equipa percorre os postos do rally/)).not.toBeInTheDocument();
  });

  it("falls back to the default copy when no override is set", () => {
    mockUseRallySettings.mockReturnValue({ settings: { rules_content: {} } });
    render(<Rules />);
    expect(screen.getByText(/Cada equipa percorre os postos do rally/)).toBeInTheDocument();
  });

  it("embeds the PDF inline when rules_pdf_url is set", () => {
    mockUseRallySettings.mockReturnValue({
      settings: { rules_pdf_url: "https://r2/regulamento.pdf" },
    });
    render(<Rules />);
    expect(screen.getByText("Regulamento oficial")).toBeInTheDocument();
    const iframe = screen.getByTitle("Regulamento oficial (PDF)");
    expect(iframe).toHaveAttribute("src", "https://r2/regulamento.pdf");
    const link = screen.getByRole("link", { name: /Abrir numa nova aba/i });
    expect(link).toHaveAttribute("href", "https://r2/regulamento.pdf");
  });

  it("hides the PDF section when rules_pdf_url is empty", () => {
    mockUseRallySettings.mockReturnValue({ settings: {} });
    render(<Rules />);
    expect(screen.queryByText("Regulamento oficial")).not.toBeInTheDocument();
  });
});
