import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ArrowLeft, MapPin, AlertTriangle } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { TeamActivitiesList } from "./TeamActivitiesList";
import { useParams } from "react-router-dom";
import {
  CheckPointService,
  TeamService,
  ActivitiesService,
  StaffEvaluationService,
  type ActivityResponse,
  type ActivityResultResponse,
  type DetailedCheckPoint,
  type ListingTeam,
} from "@/client";
import type { ActivityResultData } from "@/types/forms";
import { useAppToast } from "@/hooks/use-toast";

type EvaluationSummary = {
  total_activities: number;
  completed_activities: number;
  pending_activities: number;
  completion_rate: number;
  has_incomplete: boolean;
  missing_activities: string[];
  checkpoint_mismatch?: boolean;
  team_checkpoint?: number | null;
  current_checkpoint?: number | null;
};

type TeamActivityWithStatus = ActivityResponse & {
  evaluation_status?: "completed" | "pending";
  existing_result?: ActivityResultResponse | null;
};

type TeamActivitiesResponse = {
  team?: ListingTeam;
  activities?: TeamActivityWithStatus[];
  evaluation_summary?: EvaluationSummary;
};

type ActivityResultWithRelations = ActivityResultResponse & {
  activity?: ActivityResponse;
  team?: ListingTeam;
};

type TeamEvaluationStatusMap = Record<number, boolean>;

type EvaluatePayload = {
  teamId: number;
  activityId: number;
  resultData: ActivityResultData;
};

const toEvaluationSummary = (summary?: Partial<EvaluationSummary> | null): EvaluationSummary => ({
  total_activities: summary?.total_activities ?? 0,
  completed_activities: summary?.completed_activities ?? 0,
  pending_activities: summary?.pending_activities ?? 0,
  completion_rate: summary?.completion_rate ?? 0,
  has_incomplete: summary?.has_incomplete ?? false,
  missing_activities: summary?.missing_activities ?? [],
  checkpoint_mismatch: summary?.checkpoint_mismatch,
  team_checkpoint: summary?.team_checkpoint ?? null,
  current_checkpoint: summary?.current_checkpoint ?? null,
});

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    body?: { detail?: string };
    response?: { data?: { detail?: string } };
    message?: string;
  };

  if (typeof candidate.body?.detail === "string") {
    return candidate.body.detail;
  }

  if (typeof candidate.response?.data?.detail === "string") {
    return candidate.response.data.detail;
  }

  if (typeof candidate.message === "string") {
    return candidate.message;
  }

  return fallback;
};

export default function CheckpointTeamEvaluation() {
  const toast = useAppToast();
  const { checkpointId } = useParams<{ checkpointId: string }>();
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

      const isRallyAdmin = Boolean(userStore.scopes?.includes("admin") || userStore.scopes?.includes("manager-rally"));
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
    mutationFn: async ({ teamId, activityId, resultData }) => {
      // Force JSON body to avoid null payloads
      const token = userStore.token;
      const url = `/api/rally/v1/staff/teams/${teamId}/activities/${activityId}/evaluate`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Backend currently expects wrapper key `result_in`
        body: JSON.stringify({ result_in: resultData ?? {} }),
      });
      if (!res.ok) {
        let err: unknown = { detail: res.statusText };
        try {
          err = await res.json();
        } catch {
          // ignore JSON parse failure
        }
        throw err;
      }
      return await res.json();
    },
    onSuccess: (_data, variables) => {
      // Invalidate relevant queries so other views pick up latest scores
      queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
      queryClient.invalidateQueries({ queryKey: ["checkpointTeams"] });
      queryClient.invalidateQueries({ queryKey: ["allTeams"] });
      queryClient.invalidateQueries({ queryKey: ["allEvaluations"] });

      if (variables?.teamId != null) {
        const numericKey = Number.isNaN(Number(variables.teamId)) ? undefined : Number(variables.teamId);
        const stringKey = variables.teamId.toString();

        if (numericKey !== undefined) {
          queryClient.invalidateQueries({ queryKey: ["team", numericKey] });
        }
        queryClient.invalidateQueries({ queryKey: ["team", stringKey] });
      }

      toast.success("Atividade avaliada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao avaliar atividade"));
    },
  });

  // Handle activity evaluation
  const handleEvaluateActivity = async (teamId: number, activityId: number, resultData: ActivityResultData) => {
    evaluateActivityMutation.mutate({
      teamId,
      activityId,
      resultData,
    });
  };

  if (!checkpoint) {
    return (
      <div className="p-2 sm:p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Checkpoint Not Found</h2>
                <p className="text-muted-foreground">
                  The requested checkpoint could not be found.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-6 h-6" />
              {checkpoint.name} - Team Evaluation
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              All teams - click on a team to evaluate their activities
            </p>
          </CardHeader>
        </Card>

        {/* Team Activities View */}
        {selectedTeam && !showTeamList && (
          <div className="space-y-4">
            {/* Back Button */}
            <Button
              onClick={() => {
                setSelectedTeam(null);
                setShowTeamList(true);
              }}
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Teams
            </Button>

            {/* Team Activities */}
            {teamActivitiesLoading ? (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p>Loading team activities...</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <TeamActivitiesList
                team={selectedTeam}
                activities={teamActivities || []}
                onEvaluate={handleEvaluateActivity}
                isEvaluating={evaluateActivityMutation.isPending}
              />
            )}
          </div>
        )}

        {/* Teams List */}
        {showTeamList && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Teams Available for Evaluation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Teams at your checkpoint ({checkpoint.name}) and previous checkpoints
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                const getCheckpointNumbers = (team: ListingTeam) => {
                  const last = Number(team.last_checkpoint_number ?? 0) || 0;
                  const order = Number(checkpoint?.order ?? 0) || 0;
                  return { last, order };
                };
                const lastIsPrev = (team: ListingTeam) => {
                  const { last, order } = getCheckpointNumbers(team);
                  return last === order - 1;
                };
                const lastIsBeforePrev = (team: ListingTeam) => {
                  const { last, order } = getCheckpointNumbers(team);
                  return last < order - 1;
                };
                const lastIsAtOrBeyond = (team: ListingTeam) => {
                  const { last, order } = getCheckpointNumbers(team);
                  return last >= order;
                };

                const teams = checkpointTeams ?? [];

                const teamsToEvaluate = teams.filter(
                  (team) => !teamEvaluationStatus?.[team.id] && lastIsPrev(team),
                );

                const teamsAtPreviousCheckpoints = teams.filter(
                  (team) => !teamEvaluationStatus?.[team.id] && lastIsBeforePrev(team),
                );

                const teamsAlreadyEvaluated = teams.filter((team) => lastIsAtOrBeyond(team));

                return (
                  <>
                    {/* Teams to be evaluated at current checkpoint */}
                    {teamsToEvaluate.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-px bg-green-500/30 flex-1"></div>
                          <span className="text-green-600 text-sm font-medium px-2">
                            Teams to be evaluated at {checkpoint.name}:
                          </span>
                          <div className="h-px bg-green-500/30 flex-1"></div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                          {teamsToEvaluate.map((team) => (
                            <div
                              key={team.id}
                              className="p-3 sm:p-4 rounded-lg border border-green-500/30 bg-green-500/10 cursor-pointer hover:bg-green-500/20 transition-colors"
                              onClick={() => {
                                setSelectedTeam(team);
                                setShowTeamList(false);
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">{team.name}</h4>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                    Current
                                  </Badge>
                                  <Badge variant="outline">
                                    #{team.id}
                                  </Badge>
                                </div>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>Members: {team.num_members || 0}</p>
                                <p>Total Score: {team.total || 0}</p>
                                <p>Classification: {team.classification || 'N/A'}</p>
                                <p>Last Checkpoint: {team.last_checkpoint_number || 'None'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Teams at previous checkpoints (not evaluated) */}
                    {teamsAtPreviousCheckpoints.length > 0 && (
                      <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-px bg-yellow-500/30 flex-1"></div>
                          <span className="text-yellow-600 text-sm font-medium px-2">
                            Teams at previous checkpoints:
                          </span>
                          <div className="h-px bg-yellow-500/30 flex-1"></div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                          {teamsAtPreviousCheckpoints.map((team) => (
                            <div
                              key={team.id}
                              className="p-3 sm:p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/20 transition-colors"
                              onClick={() => {
                                setSelectedTeam(team);
                                setShowTeamList(false);
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">{team.name}</h4>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">
                                    Previous
                                  </Badge>
                                  <Badge variant="outline">
                                    #{team.id}
                                  </Badge>
                                </div>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>Members: {team.num_members || 0}</p>
                                <p>Total Score: {team.total || 0}</p>
                                <p>Classification: {team.classification || 'N/A'}</p>
                                <p>Last Checkpoint: {team.last_checkpoint_number || 'None'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Teams already evaluated */}
                    {teamsAlreadyEvaluated.length > 0 && (
                      <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-px bg-gray-500/30 flex-1"></div>
                          <span className="text-gray-600 text-sm font-medium px-2">
                            Teams already evaluated:
                          </span>
                          <div className="h-px bg-gray-500/30 flex-1"></div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                          {teamsAlreadyEvaluated.map((team) => (
                            <div
                              key={team.id}
                              className="p-3 sm:p-4 rounded-lg border opacity-75 cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => {
                                setSelectedTeam(team);
                                setShowTeamList(false);
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">{team.name}</h4>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                    ✓ Evaluated
                                  </Badge>
                                  <Badge variant="outline">
                                    #{team.id}
                                  </Badge>
                                </div>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>Members: {team.num_members || 0}</p>
                                <p>Total Score: {team.total || 0}</p>
                                <p>Classification: {team.classification || 'N/A'}</p>
                                <p>Last Checkpoint: {team.last_checkpoint_number || 'None'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No teams message */}
                    {checkpointTeams?.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No teams available for evaluation</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Warning Dialog for Incomplete Evaluations */}
        {showWarningDialog && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <Card className="max-w-2xl w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="w-5 h-5" />
                  Incomplete Evaluations Detected
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {evaluationSummary && (
                  <div className="space-y-3">
                    {evaluationSummary.checkpoint_mismatch ? (
                      <div>
                        <p className="text-sm font-semibold mb-2 text-yellow-600">
                          ⚠️ This team is from a different checkpoint
                        </p>
                        <p className="text-sm">
                          This team is from checkpoint <strong>{evaluationSummary.team_checkpoint}</strong>, 
                          but you're evaluating them for checkpoint <strong>{evaluationSummary.current_checkpoint}</strong> activities.
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          This allows evaluation of teams from previous checkpoints. Their scores will be based on the activities shown.
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm">
                          This team has <strong>{evaluationSummary.pending_activities}</strong> unevaluated 
                          {evaluationSummary.pending_activities === 1 ? ' activity' : ' activities'} out of{' '}
                          <strong>{evaluationSummary.total_activities}</strong> total activities.
                        </p>
                        {evaluationSummary.missing_activities && evaluationSummary.missing_activities.length > 0 && (
                          <div>
                            <p className="text-sm font-semibold mb-1">Missing activities:</p>
                            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                              {evaluationSummary.missing_activities.map((activity: string, idx: number) => (
                                <li key={idx}>{activity}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Would you like to proceed anyway? You can evaluate the missing activities later.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
              <div className="p-6 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowWarningDialog(false);
                    setEvaluationSummary(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}