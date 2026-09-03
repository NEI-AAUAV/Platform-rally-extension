import { useEffect, useMemo, useState } from "react";
import type { PrivilegedDetailedTeam } from "@/client";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import { formatElapsed } from "@/lib/time";

/**
 * The team's own departure time, for events that stagger the start.
 *
 * Returns null when the team leaves with everyone else (offset 0) or the event
 * has no start time configured — in both cases there is nothing extra to say.
 */
function departureTime(startTime: string | null | undefined, offsetMinutes: number): string | null {
  if (!startTime || offsetMinutes <= 0) return null;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;
  const departure = new Date(start.getTime() + offsetMinutes * 60_000);
  return departure.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

type TeamHeaderCardProps = Readonly<{
  team: PrivilegedDetailedTeam;
  showScore: boolean;
  showRanking: boolean;
  /** Position under the shared ranking policy (`lib/teamRanking`), or null
   * when the standings are not loaded. The raw `classification` column was
   * printed here, which is the number `lib/teamRanking` exists to stop the
   * various surfaces disagreeing on. */
  rank: number | null;
  completedCount: number;
  totalCount: number;
  /** Event start time (ISO); combined with the team's offset to show its own
   * departure when the event staggers starts. */
  rallyStartTime?: string | null;
}>;

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TeamHeaderCard({
  team,
  showScore,
  showRanking,
  rank,
  completedCount,
  totalCount,
  rallyStartTime,
}: TeamHeaderCardProps) {
  const initials = initialsOf(team.name);
  const terms = useEventTerms();
  const departure = departureTime(rallyStartTime, team.start_offset_minutes ?? 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!team.started_at || team.finished_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [team.finished_at, team.started_at]);
  const elapsed = useMemo(() => {
    if (team.finished_at) return team.elapsed_seconds;
    if (!team.started_at) return null;
    return Math.max(0, (now - Date.parse(team.started_at)) / 1000);
  }, [now, team.elapsed_seconds, team.finished_at, team.started_at]);

  return (
    <div className="rally-bg-accent relative overflow-hidden rounded-2xl p-6 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div className="relative z-10">
        <div className="flex items-center gap-4">
          <span className="rally-display grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-xl font-bold">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="rally-display truncate text-xl font-bold leading-tight">{team.name}</p>
            {team.access_code && (
              <p className="mt-0.5 text-sm opacity-80">Código: {team.access_code}</p>
            )}
            {departure && <p className="mt-0.5 text-sm opacity-80">A vossa partida: {departure}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4">
          {showRanking && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">
                {rank != null ? `#${rank}` : "—"}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">Posição</p>
            </div>
          )}
          {showScore && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">{team.total}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">Pontos</p>
            </div>
          )}
          <div>
            <p className="rally-display text-3xl font-bold tabular-nums">
              {completedCount}/{totalCount}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">
              {capitalize(terms.checkpoints)}
            </p>
          </div>
          {team.started_at && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">
                {new Intl.DateTimeFormat("pt-PT", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(team.started_at))}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">Início</p>
            </div>
          )}
          {elapsed != null && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">
                {formatElapsed(elapsed)}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">
                {team.finished_at ? "Tempo final" : "Tempo a decorrer"}
              </p>
            </div>
          )}
          {team.finished_at && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">
                {new Intl.DateTimeFormat("pt-PT", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(team.finished_at))}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">Terminou</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
