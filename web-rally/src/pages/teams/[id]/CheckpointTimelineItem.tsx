import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { formatTime } from "@/utils/timeFormat";
import { CheckpointDiscovery } from "@/components/shared";
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
    return new Date(current.completed_at ?? 0) > new Date(latest.completed_at ?? 0)
      ? current
      : latest;
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
    evaluationTime ??
    (isCompletedByActivity && team.times[index] ? new Date(team.times[index]) : null);

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
      <div
        className={`rally-surface rounded-2xl p-6 transition-colors hover:bg-accent ${isCurrentCheckpoint ? "rally-elevate" : ""} ${evaluationResults.length > 0 ? "cursor-pointer" : ""}`}
        onClick={() => evaluationResults.length > 0 && onToggle(index)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                Checkpoint {index + 1}
              </span>
              {isCurrentCheckpoint && (
                <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Current
                </span>
              )}
              {evaluationResults.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {evaluationResults.length} activit{evaluationResults.length === 1 ? "y" : "ies"}
                </span>
              )}
              {hasPendingTimeBasedActivity && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            </div>
            <h3 className="mb-1 text-lg font-semibold">
              {checkpoint?.name || `Checkpoint ${index + 1}`}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="mb-1 text-xl font-bold">{checkpointScore} pts</div>
              <div className="text-sm text-muted-foreground">
                {hasEvaluations && displayTime ? formatTime(displayTime) : "Not evaluated yet"}
              </div>
            </div>
            {evaluationResults.length > 0 && (
              <div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discover the place: description + photos + fun facts */}
      {checkpoint && (
        <CheckpointDiscovery
          checkpointId={checkpoint.id}
          description={checkpoint.description}
          heading="Descobre o local"
          compact
          className="mt-3 rounded-2xl border border-border bg-card/40 p-4 sm:p-5"
        />
      )}

      {/* Activity-level cards - only show when expanded */}
      {isExpanded && evaluationResults.length > 0 && (
        <div className="ml-2 mt-3 space-y-3 border-l-2 border-border pl-2">
          {evaluationResults.map((result, resultIndex: number) => {
            const activity = result.activity;
            const isTimeBased = activity?.activity_type === "TimeBasedActivity";

            // Get count of teams that have completed this activity across ALL teams
            const completedCount = allEvaluations.filter(
              (r) => r.activity?.id === activity?.id && r.final_score != null,
            ).length;

            const isCompletionPending = isTimeBased && completedCount < totalTeams;

            return (
              <div
                key={resultIndex}
                className="rounded-xl border border-border bg-card/60 p-4 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="mb-1 text-base font-semibold">{activity?.name}</h4>
                    {activity?.description && (
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    )}
                    {isCompletionPending && (
                      <div className="mt-2 rounded border border-yellow-500/30 bg-yellow-50 p-2 text-xs text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300">
                        ⚠️ Score may change: {completedCount} of {totalTeams} teams finished
                        (ranking recalculates as more teams complete)
                      </div>
                    )}
                  </div>
                  <div className="ml-4 text-right">
                    <div className="mb-1 text-lg font-bold">
                      {result.final_score?.toFixed(0)} pts
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {result.completed_at
                        ? formatTime(new Date(result.completed_at))
                        : "Not evaluated yet"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
