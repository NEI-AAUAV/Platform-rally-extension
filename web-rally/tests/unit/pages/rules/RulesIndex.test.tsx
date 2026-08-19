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

  it("renders the starter sections when no admin sections exist", () => {
    render(<Rules />);
    expect(screen.getByText("Regras & FAQ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Como funciona/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pontuação/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check-in nos postos/i })).toBeInTheDocument();
  });

  it("renders admin-authored sections instead of the starter list when present", () => {
    mockUseRallySettings.mockReturnValue({
      settings: {
        rules_sections: [
          { id: "a", title: "Secção Custom", icon: "Trophy", body: "Texto totalmente livre." },
        ],
      },
    });
    render(<Rules />);
    expect(screen.getByRole("button", { name: /Secção Custom/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Como funciona/i })).not.toBeInTheDocument();
  });

  it("toggles a section open/closed on click and shows its body", async () => {
    mockUseRallySettings.mockReturnValue({
      settings: {
        rules_sections: [{ id: "a", title: "Secção", icon: "Star", body: "Corpo da secção." }],
      },
    });
    const user = userEvent.setup();
    render(<Rules />);
    const button = screen.getByRole("button", { name: /Secção/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Corpo da secção.")).toBeInTheDocument();
  });

  it("falls back to the default icon for an unknown icon key", () => {
    mockUseRallySettings.mockReturnValue({
      settings: {
        rules_sections: [{ id: "a", title: "Secção", icon: "NotARealIcon", body: "Texto." }],
      },
    });
    render(<Rules />);
    expect(screen.getByRole("button", { name: /Secção/i })).toBeInTheDocument();
  });

  it("handles missing settings gracefully", () => {
    mockUseRallySettings.mockReturnValue({ settings: undefined });
    render(<Rules />);
    expect(screen.getByText("Regras & FAQ")).toBeInTheDocument();
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
