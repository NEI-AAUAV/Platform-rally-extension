import { useQuery } from "@tanstack/react-query";
import { Flag, MapPin, Trophy, Users } from "lucide-react";
import {
  CheckPointService,
  TeamService,
  type ListingTeam,
  type DetailedCheckPoint,
} from "@/client";
import type { RallySettingsResponse } from "@/client";
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
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
    retry: false,
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: CheckPointService.getCheckpointsApiRallyV1CheckpointGet,
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
    { Icon: Users, value: teamList.length, label: "Equipas" },
    { Icon: Trophy, value: totalPoints, label: "Pontos em jogo" },
    ...(postosCount !== undefined
      ? [{ Icon: MapPin, value: postosCount, label: "Postos" }]
      : []),
    { Icon: Flag, value: PHASE_LABEL[phase] ?? "—", label: "Estado" },
  ];

  return (
    <div className="rally-surface rally-elevate overflow-hidden">
      <dl className="grid grid-cols-2 divide-x divide-y divide-border sm:flex sm:divide-y-0">
        {cells.map(({ Icon, value, label }) => (
          <div key={label} className="flex-1 p-4 text-center sm:p-5">
            <Icon className="rally-accent mx-auto h-5 w-5" />
            <dd className="rally-display mt-1.5 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
              {value}
            </dd>
            <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default EventStatsRibbon;
