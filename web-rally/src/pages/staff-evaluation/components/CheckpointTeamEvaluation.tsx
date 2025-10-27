import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ArrowLeft, MapPin, AlertTriangle } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { TeamActivitiesList } from "./TeamActivitiesList";
import { useParams } from "react-router-dom";
import { CheckPointService, TeamService, ActivitiesService, StaffEvaluationService } from "@/client";
import { useAppToast } from "@/hooks/use-toast";

export default function CheckpointTeamEvaluation() {
  const toast = useAppToast();
  const { checkpointId } = useParams<{ checkpointId: string }>();
  const userStore = useUserStore();
  const queryClient = useQueryClient();
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [showTeamList, setShowTeamList] = useState(true);
  const [evaluationSummary, setEvaluationSummary] = useState<any>(null);
  const [showWarningDialog, setShowWarningDialog] = useState(false);

  // Get checkpoint details from the list of all checkpoints
  const { data: checkpoint } = useQuery({
    queryKey: ["checkpoint", checkpointId],
    queryFn: async () => {
      const checkpoints = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      const checkpoint = checkpoints.find((cp: any) => cp.id === parseInt(checkpointId || '0'));
      
      if (!checkpoint) {
        throw new Error("Checkpoint not found");
      }
      
      return checkpoint;
    },
    enabled: !!userStore.token && !!checkpointId,
  });

  // Get teams for this specific checkpoint
  const { data: checkpointTeams } = useQuery({
    queryKey: ["checkpointTeams", checkpointId],
    queryFn: async () => {
      const allTeams = await TeamService.getTeamsApiRallyV1TeamGet();
      // Show all teams, no filtering
      return allTeams;
    },
    enabled: !!userStore.token && !!checkpoint,
  });

  // Get team evaluation status
  const { data: teamEvaluationStatus } = useQuery({
    queryKey: ["teamEvaluationStatus", checkpointId],
    queryFn: async () => {
      if (!checkpointTeams) return {};
      
      const evaluationStatus: Record<number, boolean> = {};
      
      // Try to get all activity results to check evaluation status
      try {
        // First get activities for this checkpoint
        const activitiesData = await ActivitiesService.getActivitiesApiRallyV1ActivitiesGet();
        const checkpointActivities = (activitiesData.activities || [])
          .filter((activity: any) => activity.checkpoint_id === checkpoint?.id);
        
        // Then get all results
        const results = await ActivitiesService.getAllActivityResultsApiRallyV1ActivitiesResultsGet();
        
        // Check if each team has evaluations for ALL activities in this checkpoint
        checkpointTeams.forEach((team: any) => {
          const teamResults = results.filter((result: any) => 
            result.team_id === team.id && 
            checkpointActivities.some((activity: any) => activity.id === result.activity_id)
          );
          
          // Team is considered evaluated if they have results for ALL activities in the checkpoint
          evaluationStatus[team.id] = teamResults.length === checkpointActivities.length && checkpointActivities.length > 0;
        });
      } catch (error) {
        // Fallback: assume no evaluations
        checkpointTeams.forEach((team: any) => {
          evaluationStatus[team.id] = false;
        });
      }
      
      return evaluationStatus;
    },
    enabled: !!userStore.token && !!checkpoint && !!checkpointTeams,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Get team activities for evaluation (filtered by checkpoint)
  const { data: teamActivities, isLoading: teamActivitiesLoading } = useQuery({
    queryKey: ["teamActivities", selectedTeam?.id, checkpoint?.id],
    queryFn: async () => {
      if (!selectedTeam || !checkpoint) return [];
      
      // Check if user is admin/manager - if so, skip staff endpoint
      const isRallyAdmin = !!userStore.scopes?.includes("admin") || 
                          !!userStore.scopes?.includes("manager-rally");
      
      // Check checkpoint mismatch first for all users (staff and admin)
      const teamCheckpoint = selectedTeam?.last_checkpoint_number || selectedTeam?.current_checkpoint_number;
      const isFromDifferentCheckpoint = teamCheckpoint && teamCheckpoint !== checkpoint?.order;
      
      if (!isRallyAdmin) {
        // Try staff endpoint first for staff users
        try {
          const data = await StaffEvaluationService.getTeamActivitiesForEvaluationApiRallyV1StaffTeamsTeamIdActivitiesGet(selectedTeam.id);
          const activities = Array.isArray(data.activities) ? data.activities : [];
          
          // Check if there are incomplete evaluations
          if (data.evaluation_summary && data.evaluation_summary.has_incomplete || isFromDifferentCheckpoint) {
            const summaryToShow = data.evaluation_summary || {
              total_activities: activities.length,
              completed_activities: 0,
              pending_activities: activities.length,
              completion_rate: 0,
              has_incomplete: true,
              missing_activities: []
            };
            
            if (isFromDifferentCheckpoint) {
              summaryToShow.checkpoint_mismatch = true;
              summaryToShow.team_checkpoint = teamCheckpoint;
              summaryToShow.current_checkpoint = checkpoint?.order;
            }
            
            setEvaluationSummary(summaryToShow);
            setShowWarningDialog(true);
          }
          
          return activities;
        } catch (error) {
          // Staff endpoint failed, trying general endpoint
        }
      } else {
        // For admins, still check checkpoint mismatch
        if (isFromDifferentCheckpoint) {
          const summaryToShow = {
            checkpoint_mismatch: true,
            team_checkpoint: teamCheckpoint,
            current_checkpoint: checkpoint?.order,
            total_activities: 0,
            completed_activities: 0,
            pending_activities: 0
          };
          
          setEvaluationSummary(summaryToShow);
          setShowWarningDialog(true);
        }
      }
      
      // Use general activities endpoint (for managers/admins or as fallback)
      const data = await ActivitiesService.getActivitiesApiRallyV1ActivitiesGet();
      let activities = Array.isArray(data.activities) ? data.activities : [];
      
      // Filter activities by checkpoint
      activities = activities.filter((activity: any) => activity.checkpoint_id === checkpoint?.id);
      
      // Get activity results to determine evaluation status
      let results: any[] = [];
      try {
        results = await ActivitiesService.getAllActivityResultsApiRallyV1ActivitiesResultsGet();
      } catch (error) {
        // If we can't fetch results, just use empty array
        results = [];
      }
      
      // Add evaluation status to each activity
      activities = activities.map((activity: any) => {
        const hasResult = results.some((result: any) => 
          result.activity_id === activity.id && result.team_id === selectedTeam.id
        );
        
        return {
          ...activity,
          evaluation_status: hasResult ? "completed" : "pending",
          existing_result: results.find((result: any) => 
            result.activity_id === activity.id && result.team_id === selectedTeam.id
          )
        };
      });
      
      return activities;
    },
    enabled: !!selectedTeam && !!userStore.token && !!checkpoint,
  });

  // Evaluate activity mutation
  const evaluateActivityMutation = useMutation({
    mutationFn: async ({ teamId, activityId, resultData }: {
      teamId: number;
      activityId: number;
      resultData: any;
    }) => {
      return await StaffEvaluationService.evaluateTeamActivityApiRallyV1StaffTeamsTeamIdActivitiesActivityIdEvaluatePost(
        teamId, 
        activityId, 
        resultData
      );
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
      queryClient.invalidateQueries({ queryKey: ["checkpointTeams"] });
      queryClient.invalidateQueries({ queryKey: ["allTeams"] });
      toast.success("Atividade avaliada com sucesso!");
    },
    onError: (error: any) => {
      const errorMessage = error?.body?.detail || 
                          error?.response?.data?.detail || 
                          error?.message || 
                          "Erro ao avaliar atividade";
      toast.error(errorMessage);
    },
  });

  // Handle activity evaluation
  const handleEvaluateActivity = async (teamId: number, activityId: number, resultData: any) => {
    evaluateActivityMutation.mutate({
      teamId,
      activityId,
      resultData,
    });
  };

  if (!checkpoint) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-6">
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
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
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
                <CardContent className="p-6">
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
                // Group teams into 3 categories
                const teamsToEvaluate = (checkpointTeams || []).filter((team: any) => 
                  !teamEvaluationStatus?.[team.id] && 
                  team.current_checkpoint_number === checkpoint.order
                );
                
                const teamsAtPreviousCheckpoints = (checkpointTeams || []).filter((team: any) => 
                  !teamEvaluationStatus?.[team.id] && 
                  team.current_checkpoint_number !== null && 
                  team.current_checkpoint_number > 0 && 
                  team.current_checkpoint_number < checkpoint.order
                );
                
                const teamsAlreadyEvaluated = (checkpointTeams || []).filter((team: any) => 
                  teamEvaluationStatus?.[team.id]
                );

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
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {teamsToEvaluate.map((team: any) => (
                            <div
                              key={team.id}
                              className="p-4 rounded-lg border border-green-500/30 bg-green-500/10 cursor-pointer hover:bg-green-500/20 transition-colors"
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
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {teamsAtPreviousCheckpoints.map((team: any) => (
                            <div
                              key={team.id}
                              className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/20 transition-colors"
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
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {teamsAlreadyEvaluated.map((team: any) => (
                            <div
                              key={team.id}
                              className="p-4 rounded-lg border opacity-75 cursor-pointer hover:opacity-90 transition-opacity"
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