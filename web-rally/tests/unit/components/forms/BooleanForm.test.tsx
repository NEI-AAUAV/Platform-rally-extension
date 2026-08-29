import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import BooleanForm from "@/components/forms/BooleanForm";
import type { Team } from "@/types/forms";
import type { ActivityResultResponse } from "@/client";

const { mockUseRallySettings, mockToast } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/themes/bloody", () => ({
  BloodyButton: (props: ComponentProps<"button">) => <button {...props} />,
}));

vi.mock("@/hooks/useGlobalPenaltyCounters", () => ({
  useGlobalPenaltyCounters: () => ({ globalPenaltyCounters: [], isLoading: false }),
  default: () => ({ globalPenaltyCounters: [], isLoading: false }),
  globalCounterKey: (id: number) => `g_${id}`,
}));

vi.mock("@/hooks/useRallySettings", () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => mockToast,
}));

describe("BooleanForm", () => {
  const mockTeam = { id: 1, name: "Team A", num_members: 4 } as unknown as Team;
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({
      settings: {
        raw_settings: {
          extra_shots_penalty_per_member: 1,
          penalty_values: { vomit: 50, not_drinking: 20 },
        },
      },
    });
  });

  it("renders without crashing", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Tentativas")).toBeInTheDocument();
  });

  it("submits with default values", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { success: false, attempts: 1, notes: "" },
      extra_shots: 0,
      penalty_counts: {},
    });
  });

  it("toggles success checkbox and updates attempts", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Tentativas"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { success: true, attempts: 3, notes: "" },
      extra_shots: 0,
      penalty_counts: {},
    });
  });

  it("submits the typed penalty count, leaving the pricing to the server", () => {
    // 2 vomits submit as the count 2. The client no longer multiplies by a
    // rate: doing so let the request body name its own deduction, and made the
    // score depend on whether the client's settings fetch had succeeded.
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText("Número de vezes que vomitou"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ penalty_counts: { vomit: 2 } }),
    );
  });

  it("falls back to 1 attempt when input is invalid", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText("Tentativas"), { target: { value: "abc" } });
    expect(screen.getByLabelText("Tentativas")).toHaveValue(1);
  });

  it("prefills fields from existingResult", () => {
    render(
      <BooleanForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          {
            result_data: { success: true, attempts: 5, notes: "prior notes" },
            extra_shots: 2,
            penalties: { vomit: 1 },
          } as unknown as ActivityResultResponse
        }
      />,
    );
    expect(screen.getByLabelText("Tentativas")).toHaveValue(5);
    expect(screen.getByDisplayValue("prior notes")).toBeInTheDocument();
  });

  it("blocks submission when extra shots exceed max", () => {
    const { container } = render(
      <BooleanForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          { result_data: {}, extra_shots: 999, penalty_counts: {} } as unknown as ActivityResultResponse
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
          { result_data: {}, extra_shots: 0, penalty_counts: {} } as unknown as ActivityResultResponse
        }
      />,
    );
    expect(screen.getByRole("button", { name: /Atualizar avaliação/ })).toBeInTheDocument();
  });

  it("shows Saving... label when isSubmitting is true", () => {
    render(<BooleanForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={true} />);
    expect(screen.getByRole("button", { name: /A guardar/ })).toBeInTheDocument();
  });
});
