import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCheckpoints,
  getTeams,
  getActivities,
  getAllActivityResults,
  getTeamActivitiesForEvaluation,
  evaluateTeamActivity,
  type ActivityResultEvaluation,
  type ActivityResponse,
  type ActivityResultResponse,
  type DetailedCheckPoint,
  type ListingTeam,
} from "@/client";
import { ApiError } from "@/services/apiClient";
import { enqueue } from "@/offline/evalQueue";
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

/** Thrown when a submit is buffered offline instead of reaching the server. */
class OfflineQueuedError extends Error {
  constructor() {
    super("offline-queued");
    this.name = "OfflineQueuedError";
  }
}

/**
 * True when the failure is a lost connection (no server response), not a server
 * error. The generated client's error interceptor (src/services/apiClient.ts)
 * wraps every failure — including a thrown fetch error with no response — into
 * an `ApiError`, using `status: 0` for the no-response case. So an `ApiError`
 * with a real HTTP status means the server answered (don't queue); status 0
 * means the request never reached it. A bare `TypeError` ("Failed to fetch")
 * or `navigator.onLine === false` covers failures from callers not going
 * through that interceptor.
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 0;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
}

interface StaffActivitiesParams {
  selectedTeam: ListingTeam;
  checkpoint: DetailedCheckPoint;
  isFromDifferentCheckpoint: boolean;
  lastCheckpointNum: number;
  onShowWarning: (summary: EvaluationSummary) => void;
}

/**
 * Loads activities from the staff-scoped endpoint. Returns null (instead of
 * throwing) when the caller should fall back to the general activities endpoint.
 */
async function tryLoadStaffActivities({
  selectedTeam,
  checkpoint,
  isFromDifferentCheckpoint,
  lastCheckpointNum,
  onShowWarning,
}: StaffActivitiesParams): Promise<TeamActivityWithStatus[] | null> {
  try {
    const { data: rawData } = await getTeamActivitiesForEvaluation({
      path: { team_id: selectedTeam.id },
    });
    const data = rawData as unknown as TeamActivitiesResponse;

    const activities = Array.isArray(data.activities) ? data.activities : [];
    const summary = data.evaluation_summary ? toEvaluationSummary(data.evaluation_summary) : null;

    if (summary?.has_incomplete || isFromDifferentCheckpoint) {
      onShowWarning(
        toEvaluationSummary({
          ...summary,
          checkpoint_mismatch: summary?.checkpoint_mismatch ?? isFromDifferentCheckpoint,
          team_checkpoint: summary?.team_checkpoint ?? lastCheckpointNum,
          current_checkpoint: summary?.current_checkpoint ?? checkpoint.order,
        }),
      );
    }

    return isFromDifferentCheckpoint ? null : activities;
  } catch {
    return null;
  }
}

function computeTeamEvaluationStatus(
  checkpointTeams: ListingTeam[],
  checkpointActivities: ActivityResponse[],
  results: ActivityResultWithRelations[],
): TeamEvaluationStatusMap {
  const evaluationStatus: TeamEvaluationStatusMap = {};

  for (const team of checkpointTeams) {
    const completedResults = results.filter(
      (result) =>
        result.team_id === team.id &&
        result.is_completed === true &&
        checkpointActivities.some((activity) => activity.id === result.activity_id),
    );

    evaluationStatus[team.id] =
      checkpointActivities.length > 0 && completedResults.length === checkpointActivities.length;
  }

  return evaluationStatus;
}

async function loadGeneralActivities(
  checkpoint: DetailedCheckPoint,
  teamId: number,
): Promise<TeamActivityWithStatus[]> {
  const { data } = await getActivities({ query: { limit: 100, checkpoint_id: checkpoint.id } });
  const activities: ActivityResponse[] = (data.activities ?? []).filter(
    (activity) => activity.checkpoint_id === checkpoint.id,
  );

  let results: ActivityResultWithRelations[] = [];
  try {
    const { data: resultsData } = await getAllActivityResults();
    results = resultsData as unknown as ActivityResultWithRelations[];
  } catch {
    results = [];
  }

  return activities.map((activity) => {
    const existingResult = results.find(
      (result) => result.activity_id === activity.id && result.team_id === teamId,
    );
    return {
      ...activity,
      evaluation_status: existingResult ? "completed" : "pending",
      existing_result: existingResult,
    };
  });
}

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
  // Synchronous re-entrancy guard for handleEvaluateActivity: mutation.isPending
  // updates on the next render, which is too late to catch two clicks that land
  // in the same synchronous burst (e.g. a fast double-click or a forced/
  // programmatic second dispatch) — a plain ref flips immediately.
  const isEvaluatingRef = useRef(false);

  // Get checkpoint details from the list of all checkpoints
  const { data: checkpoint } = useQuery<DetailedCheckPoint>({
    queryKey: ["checkpoint", checkpointId],
    queryFn: async () => {
      const { data: checkpoints } = await getCheckpoints();
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
      const { data: allTeams } = await getTeams();
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

      try {
        const { data: activitiesData } = await getActivities();
        const checkpointActivities: ActivityResponse[] = (activitiesData.activities ?? []).filter(
          (activity) => activity.checkpoint_id === checkpoint.id,
        );

        const { data: resultsData } = await getAllActivityResults();
        const results = resultsData as unknown as ActivityResultWithRelations[];

        return computeTeamEvaluationStatus(checkpointTeams, checkpointActivities, results);
      } catch {
        const evaluationStatus: TeamEvaluationStatusMap = {};
        for (const team of checkpointTeams) {
          evaluationStatus[team.id] = false;
        }
        return evaluationStatus;
      }
    },
    enabled: !!userStore.token && !!checkpoint && !!checkpointTeams,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Get team activities for evaluation (filtered by checkpoint)
  const { data: teamActivities, isLoading: teamActivitiesLoading } = useQuery<
    TeamActivityWithStatus[]
  >({
    queryKey: ["teamActivities", selectedTeam?.id, checkpoint?.id],
    queryFn: async (): Promise<TeamActivityWithStatus[]> => {
      if (!selectedTeam || !checkpoint) {
        return [];
      }

      const lastCheckpointNum = selectedTeam.last_checkpoint_number ?? 0;
      const expectedPreviousCheckpoint = checkpoint.order ? checkpoint.order - 1 : 0;
      const isFromDifferentCheckpoint = lastCheckpointNum !== expectedPreviousCheckpoint;

      const staffResult = isRallyAdmin
        ? null
        : await tryLoadStaffActivities({
            selectedTeam,
            checkpoint,
            isFromDifferentCheckpoint,
            lastCheckpointNum,
            onShowWarning: (summary) => {
              setEvaluationSummary(summary);
              setShowWarningDialog(true);
            },
          });

      if (staffResult) {
        return staffResult;
      }

      if (isRallyAdmin && isFromDifferentCheckpoint) {
        setEvaluationSummary(
          toEvaluationSummary({
            checkpoint_mismatch: true,
            team_checkpoint: lastCheckpointNum,
            current_checkpoint: checkpoint.order,
          }),
        );
        setShowWarningDialog(true);
      }

      return loadGeneralActivities(checkpoint, selectedTeam.id);
    },
    enabled: !!selectedTeam && !!userStore.token && !!checkpoint,
  });

  // Evaluate activity mutation
  const evaluateActivityMutation = useMutation<ActivityResultResponse, unknown, EvaluatePayload>({
    mutationFn: async ({
      teamId,
      activityId,
      resultData,
      idempotencyKey,
    }): Promise<ActivityResultResponse> => {
      // Payload structure matching the ActivityResultEvaluation schema.
      const payload: ActivityResultEvaluation = {
        result_data: resultData?.result_data ?? {},
        extra_shots: resultData?.extra_shots ?? 0,
        penalties: resultData?.penalties ?? {},
      };
      try {
        const { data } = await evaluateTeamActivity({
          path: { team_id: teamId, activity_id: activityId },
          body: payload,
          headers: { "Idempotency-Key": idempotencyKey },
        });
        return data;
      } catch (error) {
        // A network/offline failure (no server response) is retryable: queue it
        // for background replay with the SAME idempotency key, then surface a
        // "pending sync" state rather than a hard error.
        if (isNetworkError(error)) {
          await enqueue({ idempotencyKey, teamId, activityId, resultData });
          throw new OfflineQueuedError();
        }

        // Surface validation detail and rethrow it in the same shape callers
        // already handle ({ detail }).
        if (error instanceof ApiError) {
          if (error.status === 422) {
            console.error("Validation error:", (error.body as { detail?: unknown })?.detail);
            console.error("Request payload:", resultData);
          }
          throw error.body ?? { detail: error.message };
        }
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      // Invalidate + actively refetch so the UI reflects the new evaluation
      // status immediately instead of waiting for the next mount/focus event.
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ["teamActivities"], refetchType: "active" }),
        queryClient.invalidateQueries({
          queryKey: ["teamEvaluationStatus"],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({ queryKey: ["checkpointTeams"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["allTeams"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["allEvaluations"], refetchType: "active" }),
      ];

      if (variables?.teamId != null) {
        const numericKey = Number.isNaN(Number(variables.teamId))
          ? undefined
          : Number(variables.teamId);
        const stringKey = variables.teamId.toString();

        if (numericKey !== undefined) {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: ["team", numericKey],
              refetchType: "active",
            }),
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
      if (error instanceof OfflineQueuedError) {
        toast.success("Sem ligação — avaliação guardada e será sincronizada.");
        return;
      }
      toast.error(getErrorMessage(error, "Erro ao avaliar atividade"));
    },
  });

  // Handle activity evaluation
  const handleEvaluateActivity = async (
    teamId: number,
    activityId: number,
    resultData: ActivityResultData,
  ) => {
    // Each call would otherwise mint its own idempotency key, so the
    // server-side Idempotency-Key dedup can't catch a double-submit either —
    // bail out synchronously before that happens.
    if (isEvaluatingRef.current) return;
    isEvaluatingRef.current = true;

    // Generate the idempotency key once per logical submit (here, not inside
    // mutationFn) so an offline-queue retry reuses the exact same key.
    const idempotencyKey = crypto.randomUUID();
    try {
      await evaluateActivityMutation.mutateAsync({
        teamId,
        activityId,
        resultData,
        idempotencyKey,
      });
    } catch {
      // Error toast (or offline-queued notice) already shown via the mutation's
      // onError; swallow here so callers awaiting this (e.g. to close the form)
      // don't need a try/catch.
    } finally {
      isEvaluatingRef.current = false;
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
