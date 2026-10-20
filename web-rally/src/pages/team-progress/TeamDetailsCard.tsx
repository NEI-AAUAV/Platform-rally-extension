import type { PrivilegedDetailedTeam } from "@/client";

type TeamDetailsCardProps = Readonly<{
  team: PrivilegedDetailedTeam;
  /** Event start time (ISO); combined with the team's offset to show its own
   * departure when the event staggers starts. */
  rallyStartTime?: string | null;
}>;

const timeFormat = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" });

/**
 * The team's own departure time, for events that stagger the start.
 *
 * Returns null when the team leaves with everyone else (offset 0) or the event
 * has no start time configured — in both cases there is nothing extra to say.
 */
export function departureTime(
  startTime: string | null | undefined,
  offsetMinutes: number,
): string | null {
  if (!startTime || offsetMinutes <= 0) return null;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;
  return timeFormat.format(new Date(start.getTime() + offsetMinutes * 60_000));
}

/** Reference facts about the team: what you look up, not what you act on. */
export default function TeamDetailsCard({ team, rallyStartTime }: TeamDetailsCardProps) {
  const departure = departureTime(rallyStartTime, team.start_offset_minutes ?? 0);
  const rows = [
    team.access_code ? { label: "Código de acesso", value: team.access_code } : null,
    departure ? { label: "A vossa partida", value: departure } : null,
    team.started_at
      ? { label: "Início", value: timeFormat.format(new Date(team.started_at)) }
      : null,
    team.finished_at
      ? { label: "Terminou", value: timeFormat.format(new Date(team.finished_at)) }
      : null,
  ].filter((row): row is { label: string; value: string } => row !== null);

  if (rows.length === 0) return null;

  return (
    <dl className="rally-surface divide-y divide-border overflow-hidden">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3">
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          <dd className="rally-num text-sm font-bold text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
