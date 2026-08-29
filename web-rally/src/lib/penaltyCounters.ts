/**
 * Per-activity penalty counters: a challenge can define its own "each miss
 * costs X points" rules (e.g. "cada falha na baliza" for a shooting game),
 * stored as free-form JSON on `Activity.config.penalty_counters` — no schema
 * change needed on either side, since `config` already accepts anything.
 *
 * The staff evaluation form always shows a *count* ("2 misses"), never a raw
 * point total — but the backend's `ActivityResult.penalties` dict is scored
 * as already-computed points (`final_score -= penalties[key]`, see
 * `BaseActivity.apply_modifiers`). Converting between the two only in this
 * one place is what closes the bug this fixes: submitting a count directly
 * used to deduct that count as points (2 vomits == -2, not -2×penalty_per_puke).
 */

export interface PenaltyCounterConfig {
  /** Key inside the penalties dict / config.penalty_counters entry. */
  key: string;
  /** Shown next to the count input. */
  label: string;
  /** Points deducted per occurrence. Positive here; subtracted at scoring time. */
  points: number;
}

export type PenaltyCountMap = Record<string, number>;

/** {key: points-per-occurrence} for every counter this activity knows about. */
export function buildPenaltyRates(
  builtIn: Record<string, number>,
  custom: readonly PenaltyCounterConfig[] = [],
): Record<string, number> {
  const rates = { ...builtIn };
  for (const counter of custom) {
    rates[counter.key] = Math.abs(counter.points);
  }
  return rates;
}

/** Counts entered by staff -> the point totals the backend expects. */
export function countsToPoints(
  counts: PenaltyCountMap,
  rates: Record<string, number>,
): PenaltyCountMap {
  const points: PenaltyCountMap = {};
  for (const [key, count] of Object.entries(counts)) {
    if (!count) continue;
    // A key with no known rate (its counter was deleted after this result was
    // scored, or points were stored raw) carries its value through unchanged —
    // multiplying by a `?? 0` fallback would silently wipe the penalty from
    // the team's total on the next edit. Mirrors pointsToCounts below.
    const rate = rates[key];
    points[key] = rate === undefined ? count : count * rate;
  }
  return points;
}

/** Point totals persisted on a result -> counts to redisplay when editing. */
export function pointsToCounts(
  points: PenaltyCountMap,
  rates: Record<string, number>,
): PenaltyCountMap {
  const counts: PenaltyCountMap = {};
  for (const [key, total] of Object.entries(points)) {
    const rate = rates[key];
    // A key with no known rate (deleted counter, or points stored raw
    // before this fix existed) keeps its stored value verbatim rather than
    // dividing by zero or silently dropping it. countsToPoints passes the
    // same key back through unchanged on submit.
    counts[key] = rate ? total / rate : total;
  }
  return counts;
}

/** Reads `config.penalty_counters`, tolerating missing/malformed JSON. */
export function parsePenaltyCounters(config: unknown): PenaltyCounterConfig[] {
  if (!config || typeof config !== "object") return [];
  const raw = (config as Record<string, unknown>).penalty_counters;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is PenaltyCounterConfig =>
      !!item &&
      typeof item === "object" &&
      typeof (item as PenaltyCounterConfig).key === "string" &&
      (item as PenaltyCounterConfig).key.length > 0 &&
      typeof (item as PenaltyCounterConfig).label === "string" &&
      typeof (item as PenaltyCounterConfig).points === "number",
  );
}
