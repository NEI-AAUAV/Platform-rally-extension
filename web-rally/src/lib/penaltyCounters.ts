/**
 * Per-activity penalty counters: a challenge can define its own "each miss
 * costs X points" rules (e.g. "cada falha na baliza" for a shooting game),
 * stored as free-form JSON on `Activity.config.penalty_counters` — no schema
 * change needed on either side, since `config` already accepts anything.
 *
 * The staff form collects a *count* ("2 misses") and submits it as
 * `penalty_counts`. It does not price it: the server multiplies the count by
 * the configured value (ScoringService.resolve_penalty_points) and writes the
 * resulting points itself. The client used to do that multiplication and send
 * the finished points, which meant the request body named its own deduction
 * and an admin price change silently rewrote the stored count on the next
 * edit. The `points` here is for display only ("5 pts cada").
 */

export interface PenaltyCounterConfig {
  /** Key inside the penalties dict / config.penalty_counters entry. */
  key: string;
  /** Shown next to the count input. */
  label: string;
  /** Points deducted per occurrence. Positive here; subtracted at scoring time. */
  points: number;
}

/**
 * A bonus counter has the same shape as a penalty counter — a label, a key and
 * a per-occurrence value. Only the sign of its effect differs, and that is
 * decided by which config field it came from, not by the entry itself.
 */
export type BonusCounterConfig = PenaltyCounterConfig;

export type PenaltyCountMap = Record<string, number>;
export type BonusCountMap = Record<string, number>;

/** Reads one counter list off a config, tolerating missing/malformed JSON. */
function parseCounterList(config: unknown, field: string): PenaltyCounterConfig[] {
  if (!config || typeof config !== "object") return [];
  const raw = (config as Record<string, unknown>)[field];
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

/** Reads `config.penalty_counters`, tolerating missing/malformed JSON. */
export function parsePenaltyCounters(config: unknown): PenaltyCounterConfig[] {
  return parseCounterList(config, "penalty_counters");
}

/** Reads `config.bonus_counters`, tolerating missing/malformed JSON. */
export function parseBonusCounters(config: unknown): BonusCounterConfig[] {
  return parseCounterList(config, "bonus_counters");
}

/**
 * Reads `config.max_bonus_points` — the ceiling on the summed bonus.
 *
 * `undefined` means uncapped. `0` is a real cap and must survive the trip, so
 * this checks the type rather than truthiness. The server truncates regardless;
 * the value is read here only to show the ceiling and warn before submitting.
 */
export function parseMaxBonusPoints(config: unknown): number | undefined {
  if (!config || typeof config !== "object") return undefined;
  const raw = (config as Record<string, unknown>).max_bonus_points;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}
