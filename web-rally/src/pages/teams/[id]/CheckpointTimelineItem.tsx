import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useThemedComponents } from "@/components/themes";
import { formatTime } from "@/utils/timeFormat";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";
import type { EvaluationResult } from "./teamDetails.types";

interface CheckpointTimelineItemProps {
  team: DetailedTeam;
  index: number;
  checkpoints: DetailedCheckPoint[] | undefined;
  activityResults: EvaluationResult[];
  allEvaluations: EvaluationResult[];
  totalTeams: number;
  isExpanded: boolean;
  onToggle: (index: number) => void;
}

export function CheckpointTimelineItem({
  team,
  index,
  checkpoints,
  activityResults,
  allEvaluations,
  totalTeams,
  isExpanded,
  onToggle,
}: CheckpointTimelineItemProps) {
  const { Card } = useThemedComponents();

  // Match checkpoint by order: team.times[index] means they visited checkpoint with order (index + 1)
  const checkpointOrder = index + 1;
  const checkpoint = checkpoints?.find((cp) => cp.order === checkpointOrder);
  const checkpointScore = team.score_per_checkpoint?.[index] ?? 0;

  // Find the evaluation timestamp from activity results
  const checkpointId = checkpoint?.id;
  // Filter results that have a score (are completed) for activities at this checkpoint
  const allCheckpointResults = checkpointId
    ? activityResults.filter(
        (result) => result.activity?.checkpoint_id === checkpointId && result.final_score != null,
      )
    : [];

  // Deduplicate by activity_id, keeping only the latest result for each activity
  const evaluationResults = Array.from(
    allCheckpointResults
      .reduce((map: Map<number, EvaluationResult>, result) => {
        const activityId = result.activity?.id;
        if (activityId) {
          const existing = map.get(activityId);
          if (
            !existing ||
            (result.completed_at &&
              existing.completed_at &&
              new Date(result.completed_at) > new Date(existing.completed_at))
          ) {
            map.set(activityId, result);
          }
        }
        return map;
      }, new Map())
      .values(),
  );

  // Get the latest evaluation timestamp
  const latestResult = evaluationResults.reduce<EvaluationResult | null>((latest, current) => {
    if (!latest) return current;
    return new Date(current.completed_at ?? 0) > new Date(latest.completed_at ?? 0) ? current : latest;
  }, null);
  const evaluationTime = latestResult?.completed_at ? new Date(latestResult.completed_at) : null;

  // isEvaluated: use activity results when available (admin view), fall back
  // to score_per_checkpoint when allEvaluations is empty (unauthenticated view).
  const activityCompletedCount = team.last_checkpoint_number ?? team.times.length;
  const isCurrentCheckpoint = checkpointOrder === activityCompletedCount + 1;
  const isCompletedByActivity = checkpointOrder <= activityCompletedCount;
  const hasEvaluations = evaluationResults.length > 0 || isCompletedByActivity;
  // Timestamp: prefer activity result, fall back to team.times entry for this checkpoint
  const displayTime =
    evaluationTime ?? (isCompletedByActivity && team.times[index] ? new Date(team.times[index]) : null);

  // Check if any activity in this checkpoint has pending completion (time-based activities)
  const hasPendingTimeBasedActivity = evaluationResults.some((result) => {
    const activity = result.activity;
    if (activity?.activity_type !== "TimeBasedActivity") return false;

    const completedCount = allEvaluations.filter(
      (r) => r.activity?.id === activity?.id && r.final_score != null,
    ).length;

    return completedCount < totalTeams;
  });

  return (
    <div>
      {/* Checkpoint summary - always visible and clickable */}
      <Card
        variant={isCurrentCheckpoint ? "elevated" : "default"}
        padding="lg"
        rounded="2xl"
        hover
        onClick={() => evaluationResults.length > 0 && onToggle(index)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium text-muted-foreground">Checkpoint {index + 1}</span>
              {isCurrentCheckpoint && (
                <span className="text-xs bg-green-600/20 text-green-300 px-2 py-1 rounded">Current</span>
              )}
              {evaluationResults.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {evaluationResults.length} activit{evaluationResults.length === 1 ? "y" : "ies"}
                </span>
              )}
              {hasPendingTimeBasedActivity && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
            </div>
            <h3 className="text-lg font-semibold mb-1">{checkpoint?.name || `Checkpoint ${index + 1}`}</h3>
            {checkpoint?.description && (
              <p className="text-sm text-muted-foreground mb-2">{checkpoint.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xl font-bold mb-1">{checkpointScore} pts</div>
              <div className="text-sm text-muted-foreground">
                {hasEvaluations && displayTime ? formatTime(displayTime) : "Not evaluated yet"}
              </div>
            </div>
            {evaluationResults.length > 0 && (
              <div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Activity-level cards - only show when expanded */}
      {isExpanded && evaluationResults.length > 0 && (
        <div className="mt-3 ml-2 pl-2 border-l-2 border-border space-y-3">
          {evaluationResults.map((result, resultIndex: number) => {
            const activity = result.activity;
            const isTimeBased = activity?.activity_type === "TimeBasedActivity";

            // Get count of teams that have completed this activity across ALL teams
            const completedCount = allEvaluations.filter(
              (r) => r.activity?.id === activity?.id && r.final_score != null,
            ).length;

            const isCompletionPending = isTimeBased && completedCount < totalTeams;

            return (
              <Card key={resultIndex} variant="subtle" padding="md" rounded="xl">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-base font-semibold mb-1">{activity?.name}</h4>
                    {activity?.description && (
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    )}
                    {isCompletionPending && (
                      <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-300">
                        ⚠️ Score may change: {completedCount} of {totalTeams} teams finished (ranking
                        recalculates as more teams complete)
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-lg font-bold mb-1">{result.final_score?.toFixed(0)} pts</div>
                    <div className="text-xs text-muted-foreground">
                      {result.completed_at ? formatTime(new Date(result.completed_at)) : "Not evaluated yet"}
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
}
