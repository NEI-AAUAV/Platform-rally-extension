import { describe, it, expect } from "vitest";
import { parseQuizQuestions, parseAnswersPerQuestion, countCorrect } from "@/lib/quizQuestions";

describe("parseQuizQuestions", () => {
  it("reads a well-formed quiz_questions array", () => {
    const config = { quiz_questions: [{ key: "q1", text: "Qual é a tua tuna favorita?" }] };
    expect(parseQuizQuestions(config)).toEqual([
      { key: "q1", text: "Qual é a tua tuna favorita?" },
    ]);
  });

  it("returns an empty array when config has no quiz_questions", () => {
    expect(parseQuizQuestions({ max_points: 100 })).toEqual([]);
  });

  it("tolerates null/undefined/non-object config", () => {
    expect(parseQuizQuestions(null)).toEqual([]);
    expect(parseQuizQuestions(undefined)).toEqual([]);
    expect(parseQuizQuestions("not an object")).toEqual([]);
  });

  it("tolerates quiz_questions that isn't an array", () => {
    expect(parseQuizQuestions({ quiz_questions: "oops" })).toEqual([]);
  });

  it("filters out malformed entries without dropping the well-formed ones", () => {
    const config = {
      quiz_questions: [
        { key: "good", text: "Good question" },
        { key: "", text: "Empty key" },
        { text: "Missing key" },
        { key: "no_text" },
        null,
        "garbage",
      ],
    };
    expect(parseQuizQuestions(config)).toEqual([{ key: "good", text: "Good question" }]);
  });
});

describe("parseAnswersPerQuestion", () => {
  it("reads a well-formed quiz_answers_per_question", () => {
    expect(parseAnswersPerQuestion({ quiz_answers_per_question: 3 })).toBe(3);
  });

  it("defaults to 1 when unset or malformed", () => {
    expect(parseAnswersPerQuestion({})).toBe(1);
    expect(parseAnswersPerQuestion(null)).toBe(1);
    expect(parseAnswersPerQuestion({ quiz_answers_per_question: "oops" })).toBe(1);
    expect(parseAnswersPerQuestion({ quiz_answers_per_question: 0 })).toBe(1);
  });

  it("floors fractional values", () => {
    expect(parseAnswersPerQuestion({ quiz_answers_per_question: 2.7 })).toBe(2);
  });
});

describe("countCorrect", () => {
  it("sums correct counts across questions", () => {
    expect(countCorrect({ q1: 2, q2: 0, q3: 1 })).toBe(3);
  });

  it("returns 0 for an empty map", () => {
    expect(countCorrect({})).toBe(0);
  });

  it("returns 0 when nothing is marked correct", () => {
    expect(countCorrect({ q1: 0, q2: 0 })).toBe(0);
  });
});
