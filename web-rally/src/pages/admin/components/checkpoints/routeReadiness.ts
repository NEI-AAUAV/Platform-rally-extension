/**
 * Labels for the readiness keys the API reports for each post
 * (see api-rally/app/services/checkpoint_planning.py).
 *
 * The API deliberately sends keys, not sentences: what counts as missing
 * depends on how the event runs, and only the UI knows how to phrase it.
 */
const MISSING_LABELS: Readonly<Record<string, string>> = {
  name: "sem nome definitivo",
  clue: "sem pista",
  coordinates: "sem coordenadas",
  activity: "sem desafio",
  staff: "sem staff",
};

/**
 * Falls back to the raw key: the API may learn a new readiness rule before
 * this map does, and showing "opening_hours" beats showing nothing.
 */
export function missingLabel(key: string): string {
  return MISSING_LABELS[key] ?? key;
}
