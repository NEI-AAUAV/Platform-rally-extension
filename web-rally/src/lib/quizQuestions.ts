/**
 * Staff-driven quiz questions for a ScoreBasedActivity — e.g. "Qual é a
 * música favorita do teu colega?" asked to pairs at a post. Stored as
 * free-form JSON on `Activity.config.quiz_questions`, same pattern as
 * `penaltyCounters.ts`: no schema change needed, `config` already accepts
 * anything.
 *
 * The staff evaluation form checks off which questions the team got right;
 * `achieved_points` (what ScoreBasedActivity already scores on) is just the
 * count of correct answers. Set the activity's `max_points` config to the
 * number of questions so each one is worth an equal share — the admin UI
 * says so next to the question list.
 */

export interface QuizQuestion {
  /** Stable id for the React key and the result_data.correct map. */
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

/** How many of the given questions are marked correct in a {key: bool} map. */
export function countCorrect(correct: Record<string, boolean>): number {
  return Object.values(correct).filter(Boolean).length;
}
