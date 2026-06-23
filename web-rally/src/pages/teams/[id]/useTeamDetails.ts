import { useQuery } from "@tanstack/react-query";
import {
  CheckPointService,
  TeamService,
  StaffEvaluationService,
  type DetailedTeam,
  type DetailedCheckPoint,
  type ListingTeam,
} from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
import { getStaffToken, getTeamToken } from "@/lib/auth/tokenStore";
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
    queryFn: async () => TeamService.getTeamByIdApiRallyV1TeamIdGet(Number(id)),
  });

  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints"],
    queryFn: CheckPointService.getCheckpointsApiRallyV1CheckpointGet,
  });

  // All evaluations across teams — used to detect ranking-pending activities.
  const { data: allEvaluationsData } = useQuery<EvaluationResult[]>({
    queryKey: ["allEvaluations"],
    queryFn: async () => {
      try {
        const response = await StaffEvaluationService.getAllEvaluationsApiRallyV1StaffAllEvaluationsGet();
        return (response.evaluations as EvaluationResult[]) || [];
      } catch {
        return [];
      }
    },
  });

  const allEvaluations = allEvaluationsData || [];

  // Evaluations for this specific team (accessible to team members).
  const { data: teamEvaluationsData } = useQuery<{ evaluations: EvaluationResult[] }>({
    queryKey: ["teamEvaluations", id],
    queryFn: async () => {
      const token = getStaffToken() || getTeamToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/rally/v1/team/${id}/evaluations`, {
        headers,
      });

      if (!response.ok) {
        return { evaluations: [] };
      }

      return response.json() as Promise<{ evaluations: EvaluationResult[] }>;
    },
    enabled: isSuccess && settings?.show_team_details !== false,
  });

  const activityResults =
    teamEvaluationsData?.evaluations ||
    allEvaluations.filter((result) => result.team_id === Number(id));

  const { data: allTeamsData } = useQuery<ListingTeam[]>({
    queryKey: ["allTeams"],
    queryFn: async () => {
      try {
        const response = await TeamService.getTeamsApiRallyV1TeamGet();
        return response || [];
      } catch {
        return [];
      }
    },
  });

  const { data: totalCheckpoints } = useQuery({
    queryKey: ["checkpoints-count"],
    queryFn: async () => {
      // Use user token if available, otherwise try team token
      const token = getStaffToken() || getTeamToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/rally/v1/checkpoint/count", {
        headers,
      });
      if (!response.ok) {
        return null;
      }
      return response.json() as Promise<number>;
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
