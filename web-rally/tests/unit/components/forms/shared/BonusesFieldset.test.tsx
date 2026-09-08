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

  describe("per-counter ceiling", () => {
    const cappedCounters = [{ key: "perf", label: "Performance", points: 2, maxPoints: 6 }];

    it("caps the input at the count that reaches the counter's own ceiling", () => {
      render(
        <BonusesFieldset
          idPrefix="test"
          bonuses={{}}
          onChange={vi.fn()}
          bonusCounters={cappedCounters}
        />,
      );
      // 6 points at 2 points each = 3 occurrences.
      expect(screen.getByLabelText("Contagem de Performance (máximo 3)")).toHaveAttribute(
        "max",
        "3",
      );
    });

    it("states the ceiling next to the counter, so staff see it before typing", () => {
      render(
        <BonusesFieldset
          idPrefix="test"
          bonuses={{}}
          onChange={vi.fn()}
          bonusCounters={cappedCounters}
        />,
      );
      expect(
        screen.getByText(/Performance \(\+2 pts cada · máx\. 6 pts \(3x\)\)/),
      ).toBeInTheDocument();
    });

    it("clamps a typed count above the ceiling instead of submitting it", () => {
      const onChange = vi.fn();
      render(
        <BonusesFieldset
          idPrefix="test"
          bonuses={{}}
          onChange={onChange}
          bonusCounters={cappedCounters}
        />,
      );
      fireEvent.change(screen.getByLabelText("Contagem de Performance (máximo 3)"), {
        target: { value: "9" },
      });
      expect(onChange).toHaveBeenCalledWith({ perf: 3 });
    });

    it("says so once the ceiling is reached", () => {
      render(
        <BonusesFieldset
          idPrefix="test"
          bonuses={{ perf: 3 }}
          onChange={vi.fn()}
          bonusCounters={cappedCounters}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Limite atingido: máximo 6 pontos neste bónus.",
      );
    });

    it("applies a global counter's own ceiling too", () => {
      const onChange = vi.fn();
      render(
        <BonusesFieldset
          idPrefix="test"
          bonuses={{}}
          onChange={onChange}
          globalBonusCounters={[{ key: "gb_1", label: "Criatividade", points: 3, maxPoints: 6 }]}
        />,
      );
      fireEvent.change(screen.getByLabelText("Contagem de Criatividade (máximo 2)"), {
        target: { value: "5" },
      });
      expect(onChange).toHaveBeenCalledWith({ gb_1: 2 });
    });

    it("leaves a counter without a ceiling unbounded", () => {
      const onChange = vi.fn();
      render(
        <BonusesFieldset
          idPrefix="test"
          bonuses={{}}
          onChange={onChange}
          bonusCounters={activityCounters}
        />,
      );
      const input = screen.getByLabelText("Contagem de Performance");
      expect(input).not.toHaveAttribute("max");
      fireEvent.change(input, { target: { value: "99" } });
      expect(onChange).toHaveBeenCalledWith({ perf: 99 });
    });

    it("keeps the per-counter ceiling separate from the ceiling on the total", () => {
      render(
        <BonusesFieldset
          idPrefix="test"
          bonuses={{ perf: 3 }}
          onChange={vi.fn()}
          bonusCounters={cappedCounters}
          maxBonusPoints={4}
        />,
      );
      // The counter's own ceiling let 6 points through; the total ceiling then
      // truncates the award to 4.
      expect(screen.getByText(/Bónus total: 4 pontos/)).toBeInTheDocument();
    });
  });
});
