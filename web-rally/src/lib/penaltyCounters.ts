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
  /**
   * Ceiling on what this single counter may contribute, in points. `undefined`
   * is unlimited; `0` is a real ceiling of zero. Only meaningful for a bonus
   * counter — a penalty has no such limit today.
   *
   * Distinct from `config.max_bonus_points`, which caps the *sum* of every
   * bonus at a checkpoint. Both apply: this one first, the total afterwards.
   */
  maxPoints?: number;
}

/**
 * A bonus counter has the same shape as a penalty counter — a label, a key and
 * a per-occurrence value. Only the sign of its effect differs, and that is
 * decided by which config field it came from, not by the entry itself.
 */
export type BonusCounterConfig = PenaltyCounterConfig;

export type PenaltyCountMap = Record<string, number>;
export type BonusCountMap = Record<string, number>;

/**
 * The dict key a counter's occurrences are stored under, derived from its
 * label: lowercase, spaces to underscores, stripped of anything that isn't a
 * letter/digit/underscore. Never shown to staff.
 *
 * Lives here rather than beside the editor that calls it because a component
 * file that also exports a plain function breaks React Fast Refresh, and the
 * lint that enforces that runs with --max-warnings 0.
 */
export function counterKeyFromLabel(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics (á -> a)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+/, "")
      .replace(/_+$/, "") || "counter"
  );
}

/** Reads one counter list off a config, tolerating missing/malformed JSON. */
function parseCounterList(config: unknown, field: string): PenaltyCounterConfig[] {
  if (!config || typeof config !== "object") return [];
  const raw = (config as Record<string, unknown>)[field];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is PenaltyCounterConfig =>
        !!item &&
        typeof item === "object" &&
        typeof (item as PenaltyCounterConfig).key === "string" &&
        (item as PenaltyCounterConfig).key.length > 0 &&
        typeof (item as PenaltyCounterConfig).label === "string" &&
        typeof (item as PenaltyCounterConfig).points === "number",
    )
    .map((item) => ({
      key: item.key,
      label: item.label,
      points: item.points,
      maxPoints: parseCounterMaxPoints(item),
    }));
}

/**
 * Reads a counter's own `max_points` ceiling, tolerating missing/malformed
 * JSON. Checks the type rather than truthiness so a configured `0` survives as
 * a real ceiling instead of collapsing to "unlimited".
 */
function parseCounterMaxPoints(counter: object): number | undefined {
  const raw = (counter as Record<string, unknown>).max_points;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

/**
 * The largest count staff may enter for a counter before its own ceiling is
 * reached, or `undefined` when it has none. A counter worth 0 points can never
 * reach a ceiling, so it stays unbounded rather than collapsing to zero.
 */
export function maxCountForCounter(counter: PenaltyCounterConfig): number | undefined {
  const price = Math.abs(counter.points);
  if (counter.maxPoints === undefined || price <= 0) return undefined;
  return Math.floor(counter.maxPoints / price);
}

/**
 * The wire shape of a counter, ready to be written back into `config`. The
 * editor holds `maxPoints` in camelCase like the rest of the app, but the
 * stored JSON is snake_case — writing the state object straight back would
 * persist a key the parser never reads, silently losing every ceiling on the
 * next save.
 */
export interface SerializedCounter {
  key: string;
  label: string;
  points: number;
  max_points?: number;
}

export function serializeCounters(counters: readonly PenaltyCounterConfig[]): SerializedCounter[] {
  return counters.map(({ key, label, points, maxPoints }) => ({
    key,
    label,
    points,
    // Omitted when unset, so "no ceiling" stays distinguishable from a
    // ceiling of 0 all the way down to the scorer.
    ...(maxPoints === undefined ? {} : { max_points: maxPoints }),
  }));
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
