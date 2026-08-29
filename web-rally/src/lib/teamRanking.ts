/**
 * Single client-side ranking policy for teams.
 *
 * The server maintains `team.classification`, but it can lag a score change by
 * a moment (or, for an unranked team, be 0). Every surface that shows standings
 * must agree, so they all sort through here — by points as the source of truth,
 * with the server rank only as a tie-break, then name for determinism.
 *
 * The rank number shown to users is always the team's 1-based position in this
 * sorted list, never the raw `classification` field: that keeps `/scoreboard`,
 * `/teams/:id`, `/team-progress`, the profile and the admin dashboard from ever
 * printing three different numbers for the same team.
 */

interface RankableTeam {
  readonly total: number;
  readonly name: string;
  readonly classification: number;
}

function compareTeams(a: RankableTeam, b: RankableTeam): number {
  if (b.total !== a.total) return b.total - a.total;
  // classification 0 == unranked: push it behind any real rank.
  const aRank = a.classification > 0 ? a.classification : Number.MAX_SAFE_INTEGER;
  const bRank = b.classification > 0 ? b.classification : Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) return aRank - bRank;
  return a.name.localeCompare(b.name);
}

/** New array, sorted best-first. Does not mutate the input. */
export function sortTeamsByRank<T extends RankableTeam>(teams: readonly T[]): T[] {
  return [...teams].sort(compareTeams);
}

/** 1-based position for the team at `index` in a `sortTeamsByRank` result. */
export function displayRank(index: number): number {
  return index + 1;
}
