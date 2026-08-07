import type { PrivilegedDetailedTeam } from "@/client";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";

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
  completedCount,
  totalCount,
  rallyStartTime,
}: TeamHeaderCardProps) {
  const initials = initialsOf(team.name);
  const terms = useEventTerms();
  const departure = departureTime(rallyStartTime, team.start_offset_minutes ?? 0);

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
        <div className="mt-5 flex gap-6">
          {showRanking && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">
                #{team.classification}
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
        </div>
      </div>
    </div>
  );
}
