import { useQuery } from "@tanstack/react-query";
import {
  getCheckpoints,
  getTeams,
  type ListingTeam,
  type DetailedCheckPoint,
  type RallySettingsResponse,
} from "@/client";
import { getEventTerms, capitalize } from "@/lib/eventTerms";
import { useCountdown } from "./useCountdown";

interface EventStatsRibbonProps {
  readonly settings?: RallySettingsResponse | null;
  /** Public visibility of the checkpoint list (settings.show_checkpoint_map). */
  readonly checkpointsPublic: boolean;
}

const PHASE_LABEL: Record<string, string> = {
  pre: "Por começar",
  live: "A decorrer",
  post: "Terminada",
};

/**
 * Compact event-wide stat strip for the homepage: number of teams, total points
 * in play, checkpoint count (when public) and the live phase, as one card split
 * by hairlines into scoreboard-style cells.
 */
export function EventStatsRibbon({ settings, checkpointsPublic }: EventStatsRibbonProps) {
  const phase = useCountdown(settings?.rally_start_time, settings?.rally_end_time).phase;

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
    retry: false,
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => (await getCheckpoints()).data,
    retry: false,
    enabled: checkpointsPublic,
  });

  const teamList = Array.isArray(teams) ? (teams as ListingTeam[]) : [];
  if (teamList.length === 0) return null;

  const totalPoints = teamList.reduce((sum, t) => sum + (t.total ?? 0), 0);
  const postosCount = Array.isArray(checkpoints)
    ? (checkpoints as DetailedCheckPoint[]).length
    : undefined;

  const cells = [
    { value: teamList.length, label: "Equipas" },
    { value: totalPoints, label: "Pontos em jogo" },
    ...(postosCount !== undefined
      ? [{ value: postosCount, label: capitalize(getEventTerms(settings?.event_type).checkpoints) }]
      : []),
    { value: PHASE_LABEL[phase] ?? "—", label: "Estado" },
  ];

  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-[22px] border border-border bg-card sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {cells.map(({ value, label }, i) => (
        <div
          key={label}
          className={[
            "flex flex-col-reverse gap-2 border-border p-5 sm:p-6",
            // Hairline grid: right border between columns, bottom border between rows.
            i % 2 === 0 ? "border-r" : "",
            i < cells.length - 2 ? "border-b sm:border-b-0" : "",
            "sm:border-r sm:last:border-r-0",
          ].join(" ")}
        >
          <dd className="rally-display text-[34px] font-bold tabular-nums leading-none text-foreground sm:text-[42px]">
            {value}
          </dd>
          <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {i === 0 && <span aria-hidden className="rally-bg-accent h-1.5 w-1.5 rounded-full" />}
            {label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

export default EventStatsRibbon;
