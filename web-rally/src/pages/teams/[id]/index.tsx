import { CheckPointService, TeamService, StaffEvaluationService } from "@/client";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowBigLeft, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import useRallySettings from "@/hooks/useRallySettings";
import { formatTime } from "@/utils/timeFormat";
import { useState } from "react";
import { useThemedComponents } from "@/components/themes";

const nthNumber = (number: number) => {
  if (number > 3 && number < 21) return "th";
  switch (number % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

export default function TeamsById() {
  const { Card } = useThemedComponents();
  const { id } = useParams<{ id: string }>();
  const { settings } = useRallySettings();
  const [expandedCheckpoints, setExpandedCheckpoints] = useState<Set<number>>(new Set());
  
  const toggleCheckpoint = (checkpointIndex: number) => {
    setExpandedCheckpoints(prev => {
      const newSet = new Set(prev);
      if (newSet.has(checkpointIndex)) {
        newSet.delete(checkpointIndex);
      } else {
        newSet.add(checkpointIndex);
      }
      return newSet;
    });
  };

  const renderTeamContent = () => {
    if (isLoading) {
      return (
        <Card variant="default" padding="lg" rounded="2xl" className="mt-16 text-center">
          <div className="text-lg font-semibold">A carregar...</div>
        </Card>
      );
    }
    
    if (isSuccess) {
      return (
        <Card variant="default" padding="lg" rounded="2xl" className="mt-16 text-center">
          <div className="text-lg font-semibold">Detalhes da equipa ocultos</div>
          <div className="text-white/70 mt-2 text-sm">
            O organizador desativou a visualização de detalhes das equipas.
          </div>
          <div className="mt-4">
            <Link to="/teams" className="inline-flex items-center gap-2 px-4 py-2 bg-[rgb(255,255,255,0.1)] hover:bg-[rgb(255,255,255,0.2)] rounded-lg text-white font-medium transition-colors">
              <ArrowBigLeft className="w-4 h-4" />
              Voltar à lista de equipas
            </Link>
          </div>
        </Card>
      );
    }
    
    return null;
  };

  const {
    data: team,
    isLoading,
    isSuccess,
    isError,
  } = useQuery({
    queryKey: ["team", id],
    queryFn: async () => {
      const response = await TeamService.getTeamByIdApiRallyV1TeamIdGet(
        Number(id),
      );
      return response;
    },
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: CheckPointService.getCheckpointsApiRallyV1CheckpointGet,
  });

  // Fetch all evaluations to check completion status across all teams
  const { data: allEvaluationsData } = useQuery({
    queryKey: ["allEvaluations"],
    queryFn: async () => {
      try {
        const response = await StaffEvaluationService.getAllEvaluationsApiRallyV1StaffAllEvaluationsGet();
        return response.evaluations || [];
      } catch (error) {
        return [];
      }
    },
  });
  
  const allEvaluations = allEvaluationsData || [];
  
  // Filter evaluations for this specific team
  const activityResults = allEvaluations.filter((result: any) => result.team_id === Number(id));
  
  // Fetch all teams count for completion status
  const { data: allTeamsData } = useQuery({
    queryKey: ["allTeams"],
    queryFn: async () => {
      try {
        const response = await TeamService.getTeamsApiRallyV1TeamGet();
        return response || [];
      } catch (error) {
        return [];
      }
    },
  });
  
  const totalTeams = allTeamsData?.length || 0;

  if (isNaN(Number(id))) {
    return <Navigate to="/teams" />;
  }

  return (
    <>
      <Button className="my-16 p-0" variant={"ghost"}>
        <Link to="/teams" className="flex">
          <ArrowBigLeft /> Go back to teams list
        </Link>
      </Button>

      {isLoading && <div>Loading...</div>}
      {isError && (
        <>
          <div>Something went wrong!</div>
          <div>The team you are trying to access may not exist!</div>
          <div>Try again later</div>
        </>
      )}
      {isSuccess && settings?.show_team_details !== false ? (
        <>
          <h2 className="mb-4 font-playfair text-2xl font-semibold">
            Team description and score
          </h2>
          <Card variant="default" padding="lg" rounded="2xl" className="mb-8">
            <div className="text-center">
              <p className="mb-4 text-xl font-semibold">
                {team.name}
              </p>
              <div>
                <p className="mb-2">{team.total} points</p>
                <p className="text-sm font-light">
                  {team.classification}
                  {nthNumber(team.classification)} place
                </p>
              </div>
            </div>
          </Card>
          <h2 className="mb-4 font-playfair text-2xl font-semibold">
            Checkpoint Progress
          </h2>
          <Card variant="default" padding="md" rounded="2xl" className="mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">
                Progress: {team.times?.length || 0} of {checkpoints?.length || 0} checkpoints
              </span>
              <span className="font-medium">
                Total: {team.total} points
              </span>
            </div>
          </Card>
          <div className="mb-8 space-y-4">
            {team.times && team.times.length > 0 ? (
              team.times.map((_, index: number) => {
                const checkpoint = checkpoints?.[index];
                const checkpointScore = team.score_per_checkpoint?.[index] ?? 0;
                const isLastCheckpoint = index === team.times.length - 1;
                
                // Find the evaluation timestamp from activity results
                const checkpointId = checkpoint?.id;
                // Filter results that have a score (are completed) for activities at this checkpoint
                const allCheckpointResults = checkpointId ? (activityResults?.filter((result: any) => 
                  result.activity && result.activity.checkpoint_id === checkpointId && result.final_score != null
                ) || []) : [];
                
                // Deduplicate by activity_id, keeping only the latest result for each activity
                const evaluationResults = Array.from(
                  allCheckpointResults.reduce((map: Map<number, any>, result: any) => {
                    const activityId = result.activity?.id;
                    if (activityId) {
                      const existing = map.get(activityId);
                      if (!existing || new Date(result.completed_at) > new Date(existing.completed_at)) {
                        map.set(activityId, result);
                      }
                    }
                    return map;
                  }, new Map()).values()
                );
                
                // Get the latest evaluation timestamp
                let evaluationTime: Date | null = null;
                if (evaluationResults.length > 0) {
                  const latestResult: any = evaluationResults.reduce((latest: any, current: any) => {
                    if (!latest) return current;
                    return new Date(current.completed_at) > new Date(latest.completed_at) ? current : latest;
                  });
                  evaluationTime = new Date(latestResult.completed_at);
                }
                
                const hasEvaluations = evaluationResults.length > 0;
                
                // Check if any activity in this checkpoint has pending completion (time-based activities)
                const hasPendingTimeBasedActivity = evaluationResults.some((result: any) => {
                  const activity = result.activity;
                  if (activity?.activity_type !== 'TimeBasedActivity') return false;
                  
                  const completedCount = allEvaluations.filter((r: any) => 
                    r.activity?.id === activity?.id && r.final_score != null
                  ).length;
                  
                  return completedCount < totalTeams;
                });
                
                const isExpanded = expandedCheckpoints.has(index);
                
                return (
                  <div key={index}>
                    {/* Checkpoint summary - always visible and clickable */}
                    <Card
                      variant={isLastCheckpoint ? "elevated" : "default"}
                      padding="lg"
                      rounded="2xl"
                      hover
                      onClick={() => evaluationResults.length > 0 && toggleCheckpoint(index)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-sm font-medium text-white/70">
                              Checkpoint {index + 1}
                            </span>
                            {isLastCheckpoint && (
                              <span className="text-xs bg-green-600/20 text-green-300 px-2 py-1 rounded">
                                Current
                              </span>
                            )}
                            {evaluationResults.length > 0 && (
                              <span className="text-xs text-white/50">
                                {evaluationResults.length} activit{evaluationResults.length === 1 ? 'y' : 'ies'}
                              </span>
                            )}
                            {hasPendingTimeBasedActivity && (
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            )}
                          </div>
                          <h3 className="text-lg font-semibold mb-1">
                            {checkpoint?.name || `Checkpoint ${index + 1}`}
                          </h3>
                          {checkpoint?.description && (
                            <p className="text-sm text-white/70 mb-2">
                              {checkpoint.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xl font-bold mb-1">
                              {checkpointScore} pts
                            </div>
                            <div className="text-sm text-white/60">
                              {hasEvaluations && evaluationTime 
                                ? formatTime(evaluationTime)
                                : "Not evaluated yet"}
                            </div>
                          </div>
                          {evaluationResults.length > 0 && (
                            <div>
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-white/70" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-white/70" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                    
                    {/* Activity-level cards - only show when expanded */}
                    {isExpanded && evaluationResults.length > 0 && (
                      <div className="mt-3 ml-2 pl-2 border-l-2 border-[rgb(255,255,255,0.1)] space-y-3">
                        {evaluationResults.map((result: any, resultIndex: number) => {
                          const activity = result.activity;
                          const isTimeBased = activity?.activity_type === 'TimeBasedActivity';
                          
                          // Get count of teams that have completed this activity across ALL teams
                          const completedCount = allEvaluations.filter((r: any) => 
                            r.activity?.id === activity?.id && r.final_score != null
                          ).length;
                          
                          const isCompletionPending = isTimeBased && completedCount < totalTeams;
                          
                          return (
                            <Card
                              key={resultIndex}
                              variant="subtle"
                              padding="md"
                              rounded="xl"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="text-base font-semibold mb-1">
                                    {activity?.name}
                                  </h4>
                                  {activity?.description && (
                                    <p className="text-sm text-white/60">
                                      {activity.description}
                                    </p>
                                  )}
                                  {isCompletionPending && (
                                    <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-300">
                                      ⚠️ Score may change: {completedCount} of {totalTeams} teams finished (ranking recalculates as more teams complete)
                                    </div>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <div className="text-lg font-bold mb-1">
                                    {result.final_score?.toFixed(0)} pts
                                  </div>
                                  <div className="text-xs text-white/60">
                                    {result.completed_at 
                                      ? formatTime(new Date(result.completed_at))
                                      : "Not evaluated yet"}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <Card variant="default" padding="lg" rounded="2xl" className="text-center">
                <p className="text-white/70">No checkpoints visited yet</p>
              </Card>
            )}
          </div>
          <h2 className="mb-4 font-playfair text-2xl font-semibold">
            Team Members
          </h2>
          <div className="grid gap-4">
            {team?.members.map((member: any) => {
              const names = member.name.split(" ");
              const firstName = names[0];
              const lastName = names.slice(1).join(" ");
              return (
                <Card
                  variant="default"
                  padding="lg"
                  rounded="2xl"
                  className="text-xl"
                  key={member.id}
                >
                  <span className="font-medium">{firstName}</span>{" "}
                  <span className="font-light">{lastName}</span>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        renderTeamContent()
      )}
    </>
  );
}
