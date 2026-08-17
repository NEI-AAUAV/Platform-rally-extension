import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import QuizQuestionConfigFields from "@/components/activity-form/QuizQuestionConfigFields";
import type { QuizQuestion } from "@/lib/quizQuestions";

describe("QuizQuestionConfigFields", () => {
  it("shows nothing to remove when there are no questions yet", () => {
    render(
      <QuizQuestionConfigFields
        questions={[]}
        onChange={vi.fn()}
        answersPerQuestion={1}
        onAnswersPerQuestionChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Remover pergunta/)).not.toBeInTheDocument();
    expect(screen.getByText("Adicionar pergunta")).toBeInTheDocument();
  });

  it("adds a new blank question with a fresh key", () => {
    const onChange = vi.fn();
    render(
      <QuizQuestionConfigFields
        questions={[]}
        onChange={onChange}
        answersPerQuestion={1}
        onAnswersPerQuestionChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Adicionar pergunta"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const added = onChange.mock.calls[0]![0];
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe("");
    expect(added[0].key).toBeTruthy();
  });

  it("updates a question's text without touching its key", () => {
    const onChange = vi.fn();
    const questions: QuizQuestion[] = [{ key: "q1", text: "" }];
    render(
      <QuizQuestionConfigFields
        questions={questions}
        onChange={onChange}
        answersPerQuestion={1}
        onAnswersPerQuestionChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Pergunta 1"), {
      target: { value: "Qual é a tuna favorita?" },
    });

    expect(onChange).toHaveBeenCalledWith([{ key: "q1", text: "Qual é a tuna favorita?" }]);
  });

  it("removes a question without touching the others", () => {
    const onChange = vi.fn();
    const questions: QuizQuestion[] = [
      { key: "q1", text: "A" },
      { key: "q2", text: "B" },
    ];
    render(
      <QuizQuestionConfigFields
        questions={questions}
        onChange={onChange}
        answersPerQuestion={1}
        onAnswersPerQuestionChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Remover pergunta 1"));

    expect(onChange).toHaveBeenCalledWith([{ key: "q2", text: "B" }]);
  });

  it("renders one row per existing question, numbered in order", () => {
    const questions: QuizQuestion[] = [
      { key: "q1", text: "A" },
      { key: "q2", text: "B" },
    ];
    render(
      <QuizQuestionConfigFields
        questions={questions}
        onChange={vi.fn()}
        answersPerQuestion={1}
        onAnswersPerQuestionChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Pergunta 1")).toHaveValue("A");
    expect(screen.getByLabelText("Pergunta 2")).toHaveValue("B");
  });

  it("reports the current answers-per-question value", () => {
    render(
      <QuizQuestionConfigFields
        questions={[]}
        onChange={vi.fn()}
        answersPerQuestion={3}
        onAnswersPerQuestionChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Respostas por pergunta/)).toHaveValue(3);
  });

  it("reports changes to answers-per-question", () => {
    const onAnswersPerQuestionChange = vi.fn();
    render(
      <QuizQuestionConfigFields
        questions={[]}
        onChange={vi.fn()}
        answersPerQuestion={1}
        onAnswersPerQuestionChange={onAnswersPerQuestionChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Respostas por pergunta/), {
      target: { value: "3" },
    });

    expect(onAnswersPerQuestionChange).toHaveBeenCalledWith(3);
  });
});
