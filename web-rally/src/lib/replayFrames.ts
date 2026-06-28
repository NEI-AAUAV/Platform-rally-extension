/**
 * Build animated leaderboard frames from the score-history timeline.
 *
 * The backend returns one entry per score change, in chronological order. Each
 * frame is the full leaderboard standing *after* applying one more entry: the
 * running total per team, sorted into ranks. Stepping through the frames
 * animates the leaderboard's evolution over the event.
 */

export interface ReplayEntry {
  readonly team_id: number;
  readonly team_name: string;
  readonly total: number;
  readonly recorded_at: string;
}

export interface ReplayRow {
  readonly teamId: number;
  readonly teamName: string;
  readonly total: number;
  readonly rank: number;
}

export interface ReplayFrame {
  /** ISO timestamp of the entry that produced this frame. */
  readonly at: string;
  /** Leaderboard standing after this entry, ranked best-first. */
  readonly rows: readonly ReplayRow[];
}

/** Rank teams by total (desc), breaking ties by name for stable ordering. */
function rank(totals: Map<number, ReplayEntry>): readonly ReplayRow[] {
  return [...totals.values()]
    .sort((a, b) => b.total - a.total || a.team_name.localeCompare(b.team_name))
    .map((entry, index) => ({
      teamId: entry.team_id,
      teamName: entry.team_name,
      total: entry.total,
      rank: index + 1,
    }));
}

/**
 * Convert a chronological list of score entries into leaderboard frames.
 * Returns an empty array when there is nothing to replay.
 */
export function buildReplayFrames(entries: readonly ReplayEntry[]): ReplayFrame[] {
  const totals = new Map<number, ReplayEntry>();
  const frames: ReplayFrame[] = [];

  for (const entry of entries) {
    totals.set(entry.team_id, entry);
    frames.push({ at: entry.recorded_at, rows: rank(totals) });
  }

  return frames;
}
