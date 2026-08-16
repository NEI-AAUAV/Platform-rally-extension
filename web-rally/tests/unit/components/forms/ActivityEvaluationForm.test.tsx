import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import type { ComponentProps } from "react";
import ActivityEvaluationForm from "@/components/forms/ActivityEvaluationForm";
import type { Team } from "@/types/forms";

vi.mock("@/components/forms/TimeBasedForm", () => ({
  default: (props: { penaltyCounters?: unknown[] }) => (
    <div
      data-testid="time-based-form"
      data-penalty-counters={JSON.stringify(props.penaltyCounters)}
    />
  ),
}));
vi.mock("@/components/forms/ScoreBasedForm", () => ({
  default: (props: { quizQuestions?: unknown[] }) => (
    <div data-testid="score-based-form" data-quiz-questions={JSON.stringify(props.quizQuestions)} />
  ),
}));
vi.mock("@/components/forms/BooleanForm", () => ({
  default: () => <div data-testid="boolean-form" />,
}));
vi.mock("@/components/forms/GeneralForm", () => ({
  default: () => <div data-testid="general-form" />,
}));
vi.mock("@/components/forms/TeamVsForm", () => ({
  default: () => <div data-testid="team-vs-form" />,
}));
vi.mock("@/components/forms/DeferredJudgedForm", () => ({
  default: () => <div data-testid="deferred-judged-form" />,
}));

describe("ActivityEvaluationForm", () => {
  type ActivityProps = ComponentProps<typeof ActivityEvaluationForm>["activity"];

  const mockTeam = { id: 1, name: "Team A" } as unknown as Team;
  const mockOnSubmit = vi.fn();
  const baseActivity = {
    id: 1,
    activity_type: "TimeBasedActivity",
    evaluation_status: "pending" as const,
    description: "Do the thing",
    config: {},
  } as unknown as ActivityProps;

  it("renders activity details", () => {
    render(
      <ActivityEvaluationForm
        activity={baseActivity}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.getByText("Detalhes da atividade")).toBeInTheDocument();
    expect(screen.getByText("TimeBasedActivity")).toBeInTheDocument();
    expect(screen.getByText("Team A")).toBeInTheDocument();
    expect(screen.getByText("Do the thing")).toBeInTheDocument();
  });

  it("does not render description when absent", () => {
    render(
      <ActivityEvaluationForm
        activity={{ ...baseActivity, description: undefined } as unknown as ActivityProps}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.queryByText("Description:")).not.toBeInTheDocument();
  });

  it.each([
    ["TimeBasedActivity", "time-based-form"],
    ["ScoreBasedActivity", "score-based-form"],
    ["BooleanActivity", "boolean-form"],
    ["GeneralActivity", "general-form"],
    ["TeamVsActivity", "team-vs-form"],
    ["DeferredJudgedActivity", "deferred-judged-form"],
  ])("renders correct form for %s", (activityType, testId) => {
    render(
      <ActivityEvaluationForm
        activity={{ ...baseActivity, activity_type: activityType } as unknown as ActivityProps}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it("renders fallback for unknown activity type", () => {
    render(
      <ActivityEvaluationForm
        activity={{ ...baseActivity, activity_type: "SomeWeirdType" } as unknown as ActivityProps}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.getByText("Tipo de atividade desconhecido: SomeWeirdType")).toBeInTheDocument();
    expect(screen.getByText("Contacte um administrador.")).toBeInTheDocument();
  });

  it("parses config.penalty_counters and passes it down to the type's form", () => {
    render(
      <ActivityEvaluationForm
        activity={{
          ...baseActivity,
          config: { penalty_counters: [{ key: "falha", label: "Falha", points: 4 }] },
        }}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.getByTestId("time-based-form").dataset.penaltyCounters).toBe(
      JSON.stringify([{ key: "falha", label: "Falha", points: 4 }]),
    );
  });

  it("passes an empty array when the activity has no penalty counters configured", () => {
    render(
      <ActivityEvaluationForm
        activity={baseActivity}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.getByTestId("time-based-form").dataset.penaltyCounters).toBe("[]");
  });

  it("parses config.quiz_questions and passes it to ScoreBasedForm only", () => {
    render(
      <ActivityEvaluationForm
        activity={{
          ...baseActivity,
          activity_type: "ScoreBasedActivity",
          config: { quiz_questions: [{ key: "q1", text: "Qual é a tuna favorita?" }] },
        }}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.getByTestId("score-based-form").dataset.quizQuestions).toBe(
      JSON.stringify([{ key: "q1", text: "Qual é a tuna favorita?" }]),
    );
  });

  it("passes an empty quiz_questions array when none are configured", () => {
    render(
      <ActivityEvaluationForm
        activity={{ ...baseActivity, activity_type: "ScoreBasedActivity" }}
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />,
    );
    expect(screen.getByTestId("score-based-form").dataset.quizQuestions).toBe("[]");
  });
});
