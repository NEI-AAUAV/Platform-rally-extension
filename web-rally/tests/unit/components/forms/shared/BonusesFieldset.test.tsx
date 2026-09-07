import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BonusesFieldset from "@/components/forms/shared/BonusesFieldset";

describe("BonusesFieldset", () => {
  const activityCounters = [{ key: "perf", label: "Performance", points: 2 }];
  const globalCounters = [{ key: "gb_1", label: "Criatividade", points: 3 }];

  it("renders one input per activity counter, priced per occurrence", () => {
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{}}
        onChange={vi.fn()}
        bonusCounters={activityCounters}
      />,
    );
    expect(screen.getByLabelText("Contagem de Performance")).toBeInTheDocument();
    expect(screen.getByText(/Performance \(\+2 pts cada\)/)).toBeInTheDocument();
  });

  it("separates global counters from this activity's own", () => {
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{}}
        onChange={vi.fn()}
        bonusCounters={activityCounters}
        globalBonusCounters={globalCounters}
      />,
    );
    expect(screen.getByText("Disponível em todos os postos")).toBeInTheDocument();
    expect(screen.getByText("Específico desta prova")).toBeInTheDocument();
  });

  it("sums both groups into the displayed total", () => {
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{ perf: 2, gb_1: 1 }}
        onChange={vi.fn()}
        bonusCounters={activityCounters}
        globalBonusCounters={globalCounters}
      />,
    );
    // 2 x 2 + 1 x 3
    expect(screen.getByText(/Bónus total: 7 pontos/)).toBeInTheDocument();
  });

  it("submits the typed count, not a points total — pricing is the server's job", () => {
    const onChange = vi.fn();
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{}}
        onChange={onChange}
        bonusCounters={activityCounters}
      />,
    );
    fireEvent.change(screen.getByLabelText("Contagem de Performance"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ perf: 3 });
  });

  it("shows the ceiling when one is configured", () => {
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{}}
        onChange={vi.fn()}
        bonusCounters={activityCounters}
        maxBonusPoints={5}
      />,
    );
    expect(screen.getByText(/máximo 5 pontos/)).toBeInTheDocument();
  });

  it("caps the displayed total and warns when the entered bonus exceeds it", () => {
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{ perf: 6 }}
        onChange={vi.fn()}
        bonusCounters={activityCounters}
        maxBonusPoints={5}
      />,
    );
    expect(screen.getByText(/Bónus total: 5 pontos/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Introduziste 12 pontos de bónus; serão contados apenas 5.",
    );
  });

  it("does not warn while the entered bonus is within the ceiling", () => {
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{ perf: 2 }}
        onChange={vi.fn()}
        bonusCounters={activityCounters}
        maxBonusPoints={5}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows no ceiling when none is configured", () => {
    render(
      <BonusesFieldset
        idPrefix="test"
        bonuses={{ perf: 50 }}
        onChange={vi.fn()}
        bonusCounters={activityCounters}
      />,
    );
    expect(screen.queryByText(/máximo/)).not.toBeInTheDocument();
    expect(screen.getByText(/Bónus total: 100 pontos/)).toBeInTheDocument();
  });
});
