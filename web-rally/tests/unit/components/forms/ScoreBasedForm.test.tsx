import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ScoreBasedForm from "@/components/forms/ScoreBasedForm";
import type { Team } from "@/types/forms";

const { mockUseRallySettings, mockToast } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/themes/bloody", () => ({
  BloodyButton: (props: ComponentProps<"button">) => <button {...props} />,
}));

vi.mock("@/hooks/useRallySettings", () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => mockToast,
}));

describe("ScoreBasedForm", () => {
  const mockTeam = { id: 1, name: "Team A", num_members: 4 } as unknown as Team;
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({
      settings: { raw_settings: { extra_shots_penalty_per_member: 0, penalty_values: {} } },
    });
  });

  it("renders without crashing", () => {
    render(<ScoreBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.getByLabelText("Achieved Points")).toBeInTheDocument();
  });

  it("submits achieved points and notes", () => {
    render(<ScoreBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText("Achieved Points"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Evaluation/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { achieved_points: 42, notes: "" },
      extra_shots: 0,
      penalties: {},
    });
  });

  it("shows error and blocks submission for negative points", () => {
    render(<ScoreBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText("Achieved Points"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Evaluation/ }));
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith("Points must be positive.");
  });

  it("prefills from existingResult", () => {
    render(
      <ScoreBasedForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          {
            result_data: { achieved_points: 77, notes: "note" },
            extra_shots: 0,
            penalties: {},
          } as any
        }
      />,
    );
    expect(screen.getByLabelText("Achieved Points")).toHaveValue(77);
    expect(screen.getByDisplayValue("note")).toBeInTheDocument();
  });

  describe("quiz mode", () => {
    const quizQuestions = [
      { key: "q1", text: "Qual é a tuna favorita?" },
      { key: "q2", text: "Onde nasceu o colega?" },
    ];

    it("renders a checklist instead of the raw points input", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={quizQuestions}
        />,
      );
      expect(screen.queryByLabelText("Achieved Points")).not.toBeInTheDocument();
      expect(screen.getByText("Qual é a tuna favorita?")).toBeInTheDocument();
      expect(screen.getByText("Onde nasceu o colega?")).toBeInTheDocument();
      expect(screen.getByText("Perguntas (0/2 certas)")).toBeInTheDocument();
    });

    it("achieved_points tracks the number of questions checked correct", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={quizQuestions}
        />,
      );
      fireEvent.click(screen.getByLabelText("Qual é a tuna favorita?"));
      expect(screen.getByText("Perguntas (1/2 certas)")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Submit Evaluation/ }));
      expect(mockOnSubmit).toHaveBeenCalledWith({
        result_data: { achieved_points: 1, quiz_correct: { q1: 1 }, notes: "" },
        extra_shots: 0,
        penalties: {},
      });
    });

    it("unchecking a question drops the count back down", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={quizQuestions}
        />,
      );
      const checkbox = screen.getByLabelText("Qual é a tuna favorita?");
      fireEvent.click(checkbox);
      fireEvent.click(checkbox);
      expect(screen.getByText("Perguntas (0/2 certas)")).toBeInTheDocument();
    });

    it("prefills the checklist from an existing quiz_correct result", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={quizQuestions}
          existingResult={
            {
              result_data: { achieved_points: 1, quiz_correct: { q1: true, q2: false }, notes: "" },
              extra_shots: 0,
              penalties: {},
            } as any
          }
        />,
      );
      expect(screen.getByLabelText("Qual é a tuna favorita?")).toBeChecked();
      expect(screen.getByLabelText("Onde nasceu o colega?")).not.toBeChecked();
    });

    it("falls back to the raw points input when no questions are configured", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={[]}
        />,
      );
      expect(screen.getByLabelText("Achieved Points")).toBeInTheDocument();
    });
  });

  describe("quiz mode with multiple answers per question", () => {
    const quizQuestions = [
      { key: "q1", text: "Qual é a tuna favorita?" },
      { key: "q2", text: "Onde nasceu o colega?" },
    ];

    it("shows a number input per question instead of a checkbox", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={quizQuestions}
          answersPerQuestion={3}
        />,
      );
      expect(screen.getByText("Perguntas (0/6 certas)")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("sums correct counts across questions into achieved_points", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={quizQuestions}
          answersPerQuestion={3}
        />,
      );
      const inputs = screen.getAllByRole("spinbutton");
      fireEvent.change(inputs[0]!, { target: { value: "2" } });
      fireEvent.change(inputs[1]!, { target: { value: "1" } });
      expect(screen.getByText("Perguntas (3/6 certas)")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Submit Evaluation/ }));
      expect(mockOnSubmit).toHaveBeenCalledWith({
        result_data: { achieved_points: 3, quiz_correct: { q1: 2, q2: 1 }, notes: "" },
        extra_shots: 0,
        penalties: {},
      });
    });

    it("clamps a count above the number of answers per question", () => {
      render(
        <ScoreBasedForm
          team={mockTeam}
          onSubmit={mockOnSubmit}
          isSubmitting={false}
          quizQuestions={quizQuestions}
          answersPerQuestion={3}
        />,
      );
      const input = screen.getAllByRole("spinbutton")[0]!;
      fireEvent.change(input, { target: { value: "9" } });
      expect(screen.getByText("Perguntas (3/6 certas)")).toBeInTheDocument();
    });
  });
});
