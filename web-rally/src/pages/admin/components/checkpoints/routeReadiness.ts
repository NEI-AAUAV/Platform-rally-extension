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

export function missingLabel(key: string): string {
  return MISSING_LABELS[key] ?? key;
}

/**
 * A post is ready when nothing is missing. Drafts are excluded from the
 * running route regardless, so readiness only decides whether publishing one
 * would put a half-written stop in front of a team.
 */
export function isReady(missing: ReadonlyArray<string> | undefined): boolean {
  return (missing?.length ?? 0) === 0;
}
