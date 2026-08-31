import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCheckpoints,
  getCheckpointsCount,
  getTeamById,
  getTeamEvaluations,
  getTeams,
  getAllEvaluations,
  type DetailedTeam,
  type DetailedCheckPoint,
  type ListingTeam,
} from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
import { displayRank, sortTeamsByRank } from "@/lib/teamRanking";
import type { EvaluationResult } from "./teamDetails.types";

/**
 * Loads everything the team-detail page renders: the team, checkpoints,
 * evaluation results (team-scoped with a global fallback), and the counts used
 * for progress + ranking-pending hints.
 */
export function useTeamDetails(id: string | undefined) {
  const { settings } = useRallySettings();

  const {
    data: team,
    isLoading,
    isSuccess,
  } = useQuery<DetailedTeam>({
    queryKey: ["team", id],
    queryFn: async () => {
      const { data } = await getTeamById({ path: { id: Number(id) } });
      return data as DetailedTeam;
    },
  });

  // Scoped to the team, like /team-progress. The route the API returns is
  // *this team's* view of it — what is revealed and what is still redacted —
  // so an unscoped cache key served one team's slice to the next one opened.
  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints", id],
    queryFn: async () => {
      const { data } = await getCheckpoints();
      return data ?? [];
    },
  });

  // All evaluations across teams — used to detect ranking-pending activities.
  const { data: allEvaluationsData } = useQuery<EvaluationResult[]>({
    queryKey: ["allEvaluations"],
    queryFn: async () => {
      try {
        const { data: evaluations } = await getAllEvaluations();
        const list = evaluations?.evaluations;
        return Array.isArray(list) ? (list as EvaluationResult[]) : [];
      } catch {
        return [];
      }
    },
  });

  const allEvaluations = Array.isArray(allEvaluationsData) ? allEvaluationsData : [];

  // Evaluations for this specific team (accessible to team members).
  const { data: teamEvaluationsData } = useQuery<{ evaluations: EvaluationResult[] }>({
    queryKey: ["teamEvaluations", id],
    queryFn: async () => {
      try {
        const { data } = await getTeamEvaluations({ path: { id: Number(id) } });
        return data as unknown as {
          evaluations: EvaluationResult[];
        };
      } catch {
        return { evaluations: [] };
      }
    },
    enabled: isSuccess && settings?.show_team_details !== false,
  });

  const teamEvaluations = teamEvaluationsData?.evaluations;
  const activityResults = Array.isArray(teamEvaluations)
    ? teamEvaluations
    : allEvaluations.filter((result) => result.team_id === Number(id));

  const { data: allTeamsData } = useQuery<ListingTeam[]>({
    queryKey: ["allTeams"],
    queryFn: async () => {
      try {
        const { data } = await getTeams();
        return data || [];
      } catch {
        return [];
      }
    },
  });

  const { data: totalCheckpoints } = useQuery({
    queryKey: ["checkpoints-count"],
    queryFn: async () => {
      try {
        const { data } = await getCheckpointsCount();
        return data ?? null;
      } catch {
        return null;
      }
    },
    // Only fetch if we are showing team details
    enabled: isSuccess && settings?.show_team_details !== false,
  });

  const totalTeams = allTeamsData?.length || 0;
  const totalCount = totalCheckpoints ?? checkpoints?.length ?? 0;

  // Straight from the server's progress engine, exactly as /team-progress
  // reads it. This page used to re-derive both from `last_checkpoint_number`,
  // which is a count and cannot describe a free-order or staged route.
  const resolvedOrders = useMemo(
    () => new Set(team?.resolved_checkpoint_orders ?? []),
    [team?.resolved_checkpoint_orders],
  );
  const nextCheckpointOrder = team ? team.current_checkpoint_number : null;
  const nextCheckpoint =
    nextCheckpointOrder == null
      ? undefined
      : checkpoints?.find((cp) => cp.order === nextCheckpointOrder);

  // The team's standing under the one client-side ranking policy, not the raw
  // `classification` column: `lib/teamRanking` exists so /scoreboard,
  // /teams/:id and /team-progress cannot print three different numbers for
  // the same team, and this page was printing the raw field.
  const rank = useMemo(() => {
    if (!team || !allTeamsData?.length) return null;
    const position = sortTeamsByRank(allTeamsData).findIndex((t) => t.id === team.id);
    return position < 0 ? null : displayRank(position);
  }, [team, allTeamsData]);

  return {
    settings,
    team,
    isLoading,
    isSuccess,
    checkpoints,
    activityResults,
    allEvaluations,
    totalTeams,
    totalCount,
    resolvedOrders,
    nextCheckpoint,
    isRouteFinished: team?.is_route_finished ?? false,
    rank,
  };
}
