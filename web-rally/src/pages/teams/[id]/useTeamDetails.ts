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

  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints"],
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
  };
}
