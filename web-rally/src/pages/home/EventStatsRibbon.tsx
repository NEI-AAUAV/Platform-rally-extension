import { useQuery } from "@tanstack/react-query";
import {
  getCheckpoints,
  getTeams,
  type ListingTeam,
  type DetailedCheckPoint,
} from "@/client";
import type { RallySettingsResponse } from "@/client";
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
 * in play, checkpoint count (when public) and the live phase. Soft-depth card
 * split into divided cells — mirrors the gamification stats ribbon, adapted to
 * event-level data since the public viewer has no personal profile.
 */
export function EventStatsRibbon({ settings, checkpointsPublic }: EventStatsRibbonProps) {
  const phase = useCountdown(settings?.rally_start_time, settings?.rally_end_time).phase;

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => await getTeams(),
    retry: false,
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => await getCheckpoints(),
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
    <dl className="grid grid-cols-2 gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {cells.map(({ value, label }) => (
        <div key={label} className="rounded-[18px] border border-border bg-card p-5">
          <dd className="rally-display text-[34px] font-bold tabular-nums leading-none text-foreground">
            {value}
          </dd>
          <dt className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

export default EventStatsRibbon;
