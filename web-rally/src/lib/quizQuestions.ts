/**
 * Staff-driven quiz questions for a ScoreBasedActivity — e.g. "Qual é a
 * música favorita do teu colega?" asked to pairs at a post. Stored as
 * free-form JSON on `Activity.config.quiz_questions`, same pattern as
 * `penaltyCounters.ts`: no schema change needed, `config` already accepts
 * anything.
 *
 * A team may split into subgroups (e.g. 3 pairs) that each answer the same
 * question independently, so the staff form records HOW MANY subgroups got
 * each question right (0..answersPerQuestion), not a single yes/no.
 * `config.quiz_answers_per_question` says how many attempts each question
 * gets; `achieved_points` (what ScoreBasedActivity already scores on) is the
 * sum of correct answers across all questions. Set the activity's
 * `max_points` config to `questions.length * answersPerQuestion` so each
 * correct answer is worth an equal share — the admin UI says so next to the
 * question list.
 */

export interface QuizQuestion {
  /** Stable id for the React key and the result_data.quiz_correct map. */
  key: string;
  text: string;
}

/** Reads `config.quiz_questions`, tolerating missing/malformed JSON. */
export function parseQuizQuestions(config: unknown): QuizQuestion[] {
  if (!config || typeof config !== "object") return [];
  const raw = (config as Record<string, unknown>).quiz_questions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is QuizQuestion =>
      !!item &&
      typeof item === "object" &&
      typeof (item as QuizQuestion).key === "string" &&
      (item as QuizQuestion).key.length > 0 &&
      typeof (item as QuizQuestion).text === "string",
  );
}

/** How many subgroups (e.g. pairs) each question is put to. Defaults to 1
 * (single yes/no answer per team) when unset or malformed. */
export function parseAnswersPerQuestion(config: unknown): number {
  if (!config || typeof config !== "object") return 1;
  const raw = (config as Record<string, unknown>).quiz_answers_per_question;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Sum of correct answers across all questions in a {key: count} map. */
export function countCorrect(correct: Record<string, number>): number {
  return Object.values(correct).reduce((sum, count) => sum + (count || 0), 0);
}
