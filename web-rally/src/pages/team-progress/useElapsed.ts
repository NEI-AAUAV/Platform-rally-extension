import { useEffect, useMemo, useState } from "react";

interface ElapsedSource {
  started_at?: string | null;
  finished_at?: string | null;
  elapsed_seconds?: number | null;
}

/**
 * Seconds the team has been on the route, ticking once a second while it is
 * running. A finished team shows the server's frozen figure; a team that has
 * not started yet has no time to show (null).
 */
export function useElapsed(team: ElapsedSource): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!team.started_at || team.finished_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [team.finished_at, team.started_at]);

  return useMemo(() => {
    if (team.finished_at) return team.elapsed_seconds ?? null;
    if (!team.started_at) return null;
    return Math.max(0, (now - Date.parse(team.started_at)) / 1000);
  }, [now, team.elapsed_seconds, team.finished_at, team.started_at]);
}
