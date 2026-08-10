import { describe, it, expect } from "vitest";
import { parseQuizQuestions, countCorrect } from "@/lib/quizQuestions";

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

describe("countCorrect", () => {
  it("counts only the true entries", () => {
    expect(countCorrect({ q1: true, q2: false, q3: true })).toBe(2);
  });

  it("returns 0 for an empty map", () => {
    expect(countCorrect({})).toBe(0);
  });

  it("returns 0 when nothing is marked correct", () => {
    expect(countCorrect({ q1: false, q2: false })).toBe(0);
  });
});
