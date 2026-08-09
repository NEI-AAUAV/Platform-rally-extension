import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PenaltyCounterConfigFields from "@/components/activity-form/PenaltyCounterConfigFields";
import type { PenaltyCounterConfig } from "@/lib/penaltyCounters";

describe("PenaltyCounterConfigFields", () => {
  it("shows nothing to remove when there are no counters yet", () => {
    render(<PenaltyCounterConfigFields counters={[]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/Remover contador/)).not.toBeInTheDocument();
    expect(screen.getByText("Adicionar contador")).toBeInTheDocument();
  });

  it("adds a new blank counter", () => {
    const onChange = vi.fn();
    render(<PenaltyCounterConfigFields counters={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText("Adicionar contador"));

    expect(onChange).toHaveBeenCalledWith([{ key: "counter_1", label: "", points: 5 }]);
  });

  it("derives the key from the label as it's typed", () => {
    const onChange = vi.fn();
    const counters: PenaltyCounterConfig[] = [{ key: "counter_1", label: "", points: 5 }];
    render(<PenaltyCounterConfigFields counters={counters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Falha na Baliza" } });

    expect(onChange).toHaveBeenCalledWith([
      { key: "falha_na_baliza", label: "Falha na Baliza", points: 5 },
    ]);
  });

  it("strips accents and punctuation when slugifying the key", () => {
    const onChange = vi.fn();
    const counters: PenaltyCounterConfig[] = [{ key: "counter_1", label: "", points: 5 }];
    render(<PenaltyCounterConfigFields counters={counters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Não Beber!" } });

    expect(onChange).toHaveBeenCalledWith([{ key: "nao_beber", label: "Não Beber!", points: 5 }]);
  });

  it("updates the points value", () => {
    const onChange = vi.fn();
    const counters: PenaltyCounterConfig[] = [{ key: "falha", label: "Falha", points: 5 }];
    render(<PenaltyCounterConfigFields counters={counters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Pontos cada"), { target: { value: "8" } });

    expect(onChange).toHaveBeenCalledWith([{ key: "falha", label: "Falha", points: 8 }]);
  });

  it("falls back to 0 points on invalid numeric input", () => {
    const onChange = vi.fn();
    const counters: PenaltyCounterConfig[] = [{ key: "falha", label: "Falha", points: 5 }];
    render(<PenaltyCounterConfigFields counters={counters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Pontos cada"), { target: { value: "abc" } });

    expect(onChange).toHaveBeenCalledWith([{ key: "falha", label: "Falha", points: 0 }]);
  });

  it("removes a counter without touching the others", () => {
    const onChange = vi.fn();
    const counters: PenaltyCounterConfig[] = [
      { key: "a", label: "A", points: 1 },
      { key: "b", label: "B", points: 2 },
    ];
    render(<PenaltyCounterConfigFields counters={counters} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Remover contador A"));

    expect(onChange).toHaveBeenCalledWith([{ key: "b", label: "B", points: 2 }]);
  });

  it("renders one row per existing counter", () => {
    const counters: PenaltyCounterConfig[] = [
      { key: "a", label: "A", points: 1 },
      { key: "b", label: "B", points: 2 },
    ];
    render(<PenaltyCounterConfigFields counters={counters} onChange={vi.fn()} />);

    expect(screen.getAllByLabelText("Nome")).toHaveLength(2);
  });
});
