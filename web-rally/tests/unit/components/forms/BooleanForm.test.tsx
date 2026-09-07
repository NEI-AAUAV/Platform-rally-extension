import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  mockTeam,
  mockUseRallySettings,
  mockToast,
  drinkingSettings,
  peddyPaperSettings,
} from "./formTestMocks";
import BooleanForm from "@/components/forms/BooleanForm";
import type { ActivityResultResponse } from "@/client";

vi.mock("@/components/themes/bloody", async () => (await import("./formTestMocks")).bloodyMock);

vi.mock(
  "@/hooks/useGlobalPenaltyCounters",
  async () => (await import("./formTestMocks")).globalPenaltyCountersMock,
);

vi.mock(
  "@/hooks/useGlobalBonusCounters",
  async () => (await import("./formTestMocks")).globalBonusCountersMock,
);

vi.mock(
  "@/hooks/useRallySettings",
  async () => (await import("./formTestMocks")).rallySettingsMock,
);

vi.mock("@/hooks/use-toast", async () => (await import("./formTestMocks")).toastMock);

describe("BooleanForm", () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue(drinkingSettings());
  });

  it("renders without crashing", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("submits with default values", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { success: false, notes: "" },
      extra_shots: 0,
      penalty_counts: {},
      bonus_counts: {},
    });
  });

  it("toggles the success checkbox", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { success: true, notes: "" },
      extra_shots: 0,
      penalty_counts: {},
      bonus_counts: {},
    });
  });

  it("submits the typed bonus count, leaving the pricing to the server", () => {
    const bonusCounters = [{ key: "perf", label: "Performance", points: 2 }];
    render(
      <BooleanForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        bonusCounters={bonusCounters}
        maxBonusPoints={5}
      />,
    );
    fireEvent.change(screen.getByLabelText("Contagem de Performance"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { success: false, notes: "" },
      extra_shots: 0,
      penalty_counts: {},
      // The count, not 6 points and not the capped 5: the server prices and caps.
      bonus_counts: { perf: 3 },
    });
  });

  it("hides the bonus section when no bonus counter is configured", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.queryByText("Bónus de performance")).not.toBeInTheDocument();
  });

  it("prefills bonus counts from an existing result", () => {
    render(
      <BooleanForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        bonusCounters={[{ key: "perf", label: "Performance", points: 2 }]}
        existingResult={
          {
            result_data: {},
            extra_shots: 0,
            penalty_counts: {},
            bonus_counts: { perf: 4 },
          } as unknown as ActivityResultResponse
        }
      />,
    );
    expect(screen.getByLabelText("Contagem de Performance")).toHaveValue(4);
  });

  it("submits the typed penalty count, leaving the pricing to the server", () => {
    // 2 vomits submit as the count 2. The client no longer multiplies by a
    // rate: doing so let the request body name its own deduction, and made the
    // score depend on whether the client's settings fetch had succeeded.
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText("Número de vezes que vomitou"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ penalty_counts: { vomit: 2 } }),
    );
  });

  it("prefills fields from existingResult", () => {
    render(
      <BooleanForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          {
            result_data: { success: true, notes: "prior notes" },
            extra_shots: 2,
            penalties: { vomit: 1 },
          } as unknown as ActivityResultResponse
        }
      />,
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByDisplayValue("prior notes")).toBeInTheDocument();
  });

  it("blocks submission when extra shots exceed max", () => {
    const { container } = render(
      <BooleanForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          {
            result_data: {},
            extra_shots: 999,
            penalty_counts: {},
          } as unknown as ActivityResultResponse
        }
      />,
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it("shows Update Evaluation label when existingResult provided", () => {
    render(
      <BooleanForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          {
            result_data: {},
            extra_shots: 0,
            penalty_counts: {},
          } as unknown as ActivityResultResponse
        }
      />,
    );
    expect(screen.getByRole("button", { name: /Atualizar avaliação/ })).toBeInTheDocument();
  });

  it("shows Saving... label when isSubmitting is true", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={true} />);
    expect(screen.getByRole("button", { name: /A guardar/ })).toBeInTheDocument();
  });

  it("hides the extra-shots and drinking-penalty fields in a peddy-paper event", () => {
    mockUseRallySettings.mockReturnValue(peddyPaperSettings());
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.queryByLabelText("Shots extra")).not.toBeInTheDocument();
    expect(screen.queryByText("Penalizações")).not.toBeInTheDocument();
  });
});
