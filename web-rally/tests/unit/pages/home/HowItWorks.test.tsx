import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import HowItWorks, { HowItWorks as HowItWorksNamed } from "@/pages/home/HowItWorks";

// useEventTerms pulls from useRallySettings (React Query), which needs a
// QueryClientProvider this test doesn't set up. Mock it with the fixed terms
// this copy already assumes.
vi.mock("@/hooks/useEventTerms", () => ({
  default: () => ({
    checkpoint: "posto",
    checkpoints: "postos",
    activity: "desafio",
    activities: "desafios",
    event: "peddy-paper",
    checkpointGender: "m",
  }),
}));

// useRallySettings is React Query too; drive gps_checkin_enabled per test.
const settingsState: { gps_checkin_enabled?: boolean } = {};
vi.mock("@/hooks/useRallySettings", () => ({
  default: () => ({ settings: { ...settingsState } }),
}));

describe("HowItWorks", () => {
  beforeEach(() => {
    delete settingsState.gps_checkin_enabled;
  });

  it("renders the section heading", () => {
    render(<HowItWorks />);
    expect(screen.getByRole("heading", { name: "Como funciona" })).toBeInTheDocument();
  });

  it("renders all three steps with titles and bodies", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Entra com a equipa")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Usa o código da tua equipa para aceder ao percurso e ao progresso ao vivo.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("Percorre os postos")).toBeInTheDocument();
    expect(
      screen.getByText("Vai a cada posto e completa cada desafio. O staff regista a tua passagem."),
    ).toBeInTheDocument();

    expect(screen.getByText("Sobe na classificação")).toBeInTheDocument();
    expect(
      screen.getByText("Cada posto soma pontos. Acompanha a pontuação e luta pelo pódio."),
    ).toBeInTheDocument();
  });

  it("never mentions a QR check-in", () => {
    render(<HowItWorks />);
    expect(screen.queryByText(/QR/)).not.toBeInTheDocument();
  });

  it("tells the team to check in by GPS when GPS check-in is on", () => {
    settingsState.gps_checkin_enabled = true;
    render(<HowItWorks />);
    expect(
      screen.getByText("Vai a cada posto, faz check-in pelo GPS e completa cada desafio."),
    ).toBeInTheDocument();
  });

  it("renders step numbers 1, 2 and 3", () => {
    render(<HowItWorks />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("exposes both a named and default export referring to the same component", () => {
    expect(HowItWorksNamed).toBe(HowItWorks);
  });

  it("links the section to its heading via aria-labelledby", () => {
    render(<HowItWorks />);
    const heading = screen.getByRole("heading", { name: "Como funciona" });
    const section = heading.closest("section");
    expect(section).toHaveAttribute("aria-labelledby", "how-heading");
    expect(heading).toHaveAttribute("id", "how-heading");
  });
});
