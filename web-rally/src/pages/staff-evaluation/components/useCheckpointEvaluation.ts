import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckPointService,
  TeamService,
  ActivitiesService,
  StaffEvaluationService,
  ApiError,
  type ActivityResultEvaluation,
  type ActivityResponse,
  type ActivityResultResponse,
  type DetailedCheckPoint,
  type ListingTeam,
} from "@/client";
import type { ActivityResultData } from "@/types/forms";
import { useUserStore } from "@/stores/useUserStore";
import useUser from "@/hooks/useUser";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import {
  toEvaluationSummary,
  type EvaluationSummary,
  type TeamActivityWithStatus,
  type TeamActivitiesResponse,
  type ActivityResultWithRelations,
  type TeamEvaluationStatusMap,
  type EvaluatePayload,
} from "./checkpointEvaluation.types";

/**
 * Owns all data fetching, mutation, and selection state for the checkpoint
 * team-evaluation screen. UI is rendered by CheckpointTeamEvaluation.
 */
export function useCheckpointEvaluation(checkpointId: string | undefined) {
  const toast = useAppToast();
  const { isRallyAdmin } = useUser();
  const userStore = useUserStore();
  const queryClient = useQueryClient();

  const [selectedTeam, setSelectedTeam] = useState<ListingTeam | null>(null);
  const [showTeamList, setShowTeamList] = useState(true);
  const [evaluationSummary, setEvaluationSummary] = useState<EvaluationSummary | null>(null);
  const [showWarningDialog, setShowWarningDialog] = useState(false);

  // Get checkpoint details from the list of all checkpoints
  const { data: checkpoint } = useQuery<DetailedCheckPoint>({
    queryKey: ["checkpoint", checkpointId],
    queryFn: async () => {
      const checkpoints = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      const parsedId = Number(checkpointId ?? "0");
      const checkpointMatch = checkpoints.find((cp) => cp.id === parsedId);

      if (!checkpointMatch) {
        throw new Error("Checkpoint not found");
      }

      return checkpointMatch;
    },
    enabled: !!userStore.token && !!checkpointId,
  });

  // Get teams for this specific checkpoint
  const { data: checkpointTeams } = useQuery<ListingTeam[]>({
    queryKey: ["checkpointTeams", checkpointId],
    queryFn: async () => {
      const allTeams = await TeamService.getTeamsApiRallyV1TeamGet();
      // Show all teams, no filtering
      return allTeams;
    },
    enabled: !!userStore.token && !!checkpoint,
  });

  // Get team evaluation status
  const { data: teamEvaluationStatus } = useQuery<TeamEvaluationStatusMap>({
    queryKey: ["teamEvaluationStatus", checkpointId],
    queryFn: async () => {
      if (!checkpointTeams || !checkpoint) {
        return {};
      }

      const evaluationStatus: TeamEvaluationStatusMap = {};

      try {
        const activitiesData = await ActivitiesService.getActivitiesApiRallyV1ActivitiesGet();
        const checkpointActivities: ActivityResponse[] = (activitiesData.activities ?? []).filter(
          (activity) => activity.checkpoint_id === checkpoint.id,
        );

        const results = (await ActivitiesService.getAllActivityResultsApiRallyV1ActivitiesResultsGet()) as ActivityResultWithRelations[];

        checkpointTeams.forEach((team) => {
          const completedResults = results.filter(
            (result) =>
              result.team_id === team.id &&
              result.is_completed === true &&
              checkpointActivities.some((activity) => activity.id === result.activity_id),
          );

          evaluationStatus[team.id] =
            checkpointActivities.length > 0 && completedResults.length === checkpointActivities.length;
        });
      } catch {
        checkpointTeams.forEach((team) => {
          evaluationStatus[team.id] = false;
        });
      }

      return evaluationStatus;
    },
    enabled: !!userStore.token && !!checkpoint && !!checkpointTeams,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Get team activities for evaluation (filtered by checkpoint)
  const { data: teamActivities, isLoading: teamActivitiesLoading } = useQuery<TeamActivityWithStatus[]>({
    queryKey: ["teamActivities", selectedTeam?.id, checkpoint?.id],
    queryFn: async (): Promise<TeamActivityWithStatus[]> => {
      if (!selectedTeam || !checkpoint) {
        return [];
      }

      const lastCheckpointNum = selectedTeam.last_checkpoint_number ?? 0;
      const expectedPreviousCheckpoint = checkpoint.order ? checkpoint.order - 1 : 0;
      const isFromDifferentCheckpoint = lastCheckpointNum !== expectedPreviousCheckpoint;

      if (!isRallyAdmin) {
        try {
          const data = (await StaffEvaluationService.getTeamActivitiesForEvaluationApiRallyV1StaffTeamsTeamIdActivitiesGet(
            selectedTeam.id,
          )) as TeamActivitiesResponse;

          const activities = Array.isArray(data.activities) ? data.activities : [];
          const summary = data.evaluation_summary ? toEvaluationSummary(data.evaluation_summary) : null;

          if ((summary && summary.has_incomplete) || isFromDifferentCheckpoint) {
            const summaryToShow = toEvaluationSummary({
              ...summary,
              checkpoint_mismatch: summary?.checkpoint_mismatch ?? isFromDifferentCheckpoint,
              team_checkpoint: summary?.team_checkpoint ?? lastCheckpointNum,
              current_checkpoint: summary?.current_checkpoint ?? checkpoint.order,
            });
            setEvaluationSummary(summaryToShow);
            setShowWarningDialog(true);
          }

          if (!isFromDifferentCheckpoint) {
            return activities;
          }
        } catch {
          // Fall through to general endpoint on failure
        }
      } else if (isFromDifferentCheckpoint) {
        setEvaluationSummary(
          toEvaluationSummary({
            checkpoint_mismatch: true,
            team_checkpoint: lastCheckpointNum,
            current_checkpoint: checkpoint.order,
          }),
        );
        setShowWarningDialog(true);
      }

      const data = await ActivitiesService.getActivitiesApiRallyV1ActivitiesGet(undefined, 100, checkpoint.id);
      const activities: ActivityResponse[] = (data.activities ?? []).filter(
        (activity) => activity.checkpoint_id === checkpoint.id,
      );

      let results: ActivityResultWithRelations[] = [];
      try {
        results = (await ActivitiesService.getAllActivityResultsApiRallyV1ActivitiesResultsGet()) as ActivityResultWithRelations[];
      } catch {
        results = [];
      }

      return activities.map((activity) => {
        const existingResult = results.find(
          (result) => result.activity_id === activity.id && result.team_id === selectedTeam.id,
        );
        return {
          ...activity,
          evaluation_status: existingResult ? "completed" : "pending",
          existing_result: existingResult,
        };
      });
    },
    enabled: !!selectedTeam && !!userStore.token && !!checkpoint,
  });

  // Evaluate activity mutation
  const evaluateActivityMutation = useMutation<ActivityResultResponse, unknown, EvaluatePayload>({
    mutationFn: async ({ teamId, activityId, resultData }): Promise<ActivityResultResponse> => {
      // Payload structure matching the ActivityResultEvaluation schema.
      const payload: ActivityResultEvaluation = {
        result_data: resultData?.result_data ?? {},
        extra_shots: resultData?.extra_shots ?? 0,
        penalties: resultData?.penalties ?? {},
      };

      try {
        return await StaffEvaluationService.evaluateTeamActivityApiRallyV1StaffTeamsTeamIdActivitiesActivityIdEvaluatePost(
          teamId,
          activityId,
          payload,
        );
      } catch (error) {
        // Surface validation detail and rethrow it in the same shape callers
        // already handle ({ detail }).
        if (error instanceof ApiError) {
          if (error.status === 422) {
            console.error("Validation error:", error.body?.detail);
            console.error("Request payload:", resultData);
          }
          throw error.body ?? { detail: error.statusText };
        }
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      // Invalidate + actively refetch so the UI reflects the new evaluation
      // status immediately instead of waiting for the next mount/focus event.
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ["teamActivities"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["teamEvaluationStatus"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["checkpointTeams"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["allTeams"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["allEvaluations"], refetchType: "active" }),
      ];

      if (variables?.teamId != null) {
        const numericKey = Number.isNaN(Number(variables.teamId)) ? undefined : Number(variables.teamId);
        const stringKey = variables.teamId.toString();

        if (numericKey !== undefined) {
          invalidations.push(
            queryClient.invalidateQueries({ queryKey: ["team", numericKey], refetchType: "active" }),
          );
        }
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ["team", stringKey], refetchType: "active" }),
        );
      }

      await Promise.all(invalidations);

      toast.success("Atividade avaliada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao avaliar atividade"));
    },
  });

  // Handle activity evaluation
  const handleEvaluateActivity = async (
    teamId: number,
    activityId: number,
    resultData: ActivityResultData,
  ) => {
    try {
      await evaluateActivityMutation.mutateAsync({
        teamId,
        activityId,
        resultData,
      });
    } catch {
      // Error toast already shown via mutation's onError; swallow here so
      // callers awaiting this (e.g. to close the form) don't need a try/catch.
    }
  };

  const selectTeam = (team: ListingTeam) => {
    setSelectedTeam(team);
    setShowTeamList(false);
  };

  const backToTeams = () => {
    setSelectedTeam(null);
    setShowTeamList(true);
  };

  const dismissWarning = () => {
    setShowWarningDialog(false);
    setEvaluationSummary(null);
  };

  return {
    checkpoint,
    checkpointTeams,
    teamEvaluationStatus,
    teamActivities,
    teamActivitiesLoading,
    selectedTeam,
    showTeamList,
    evaluationSummary,
    showWarningDialog,
    isEvaluating: evaluateActivityMutation.isPending,
    handleEvaluateActivity,
    selectTeam,
    backToTeams,
    dismissWarning,
  };
}
