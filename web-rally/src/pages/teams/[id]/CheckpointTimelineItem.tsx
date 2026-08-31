import { ChevronDown, ChevronUp } from "lucide-react";
import { formatTime } from "@/utils/timeFormat";
import { CheckpointDiscovery, ProvisionalBadge } from "@/components/shared";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";
import type { EvaluationResult } from "./teamDetails.types";
import React from "react";

type CheckpointTimelineItemProps = Readonly<{
  team: DetailedTeam;
  index: number;
  /** The post itself, from the team-scoped route the server returned. */
  checkpoint: DetailedCheckPoint;
  /** The server says this team has resolved this post. */
  isResolved: boolean;
  /** The server says this team may be at this post now. */
  isCurrent: boolean;
  activityResults: EvaluationResult[];
  allEvaluations: EvaluationResult[];
  totalTeams: number;
  isExpanded: boolean;
  onToggle: (index: number) => void;
}>;

/**
 * One post on another team's progress timeline.
 *
 * The post is passed in rather than looked up by `index + 1`: the page used to
 * iterate `Array.from({length: last_checkpoint_number})`, so it rendered only
 * as many rows as the team had completed, numbered by position, and fell back
 * to a literal `Checkpoint N` label whenever the lookup missed. Resolution
 * comes from the server's set for the same reason — `order <= completedCount`
 * only describes a strictly sequential route.
 */
export function CheckpointTimelineItem({
  team,
  index,
  checkpoint,
  isResolved,
  isCurrent,
  activityResults,
  allEvaluations,
  totalTeams,
  isExpanded,
  onToggle,
}: CheckpointTimelineItemProps) {
  const checkpointOrder = checkpoint.order;
  const isRedacted = checkpoint.is_redacted === true;
  const checkpointScore = team.score_per_checkpoint?.[checkpointOrder - 1] ?? 0;

  // Find the evaluation timestamp from activity results
  const checkpointId = checkpoint.id;
  // Filter results that have a score (are completed) for activities at this checkpoint
  const allCheckpointResults = activityResults.filter(
    (result) => result.activity?.checkpoint_id === checkpointId && result.final_score != null,
  );

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

  const isCurrentCheckpoint = isCurrent;
  const isCompletedByActivity = isResolved;
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

  const hasEvaluationsToggle = evaluationResults.length > 0;
  const ClickableElement = (hasEvaluationsToggle ? "button" : "div") as React.ElementType;
  const clickableProps = hasEvaluationsToggle
    ? {
        type: "button" as const,
        onClick: () => onToggle(index),
      }
    : {};

  return (
    <div>
      {/* Checkpoint summary - always visible and clickable */}
      <ClickableElement
        className={`rally-surface block w-full rounded-2xl p-6 text-left font-normal transition-colors hover:bg-accent ${isCurrentCheckpoint ? "rally-elevate" : ""} ${hasEvaluationsToggle ? "cursor-pointer" : ""}`}
        {...clickableProps}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                Checkpoint {checkpointOrder}
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
              {hasPendingTimeBasedActivity && <ProvisionalBadge />}
            </div>
            <h3 className="mb-1 text-lg font-semibold">
              {/* The server already replaced the name with "Posto N" when this
                  post is still redacted for the viewer, so `name` is safe to
                  print as-is. */}
              {checkpoint.name}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="mb-1 text-xl font-bold">
                {checkpointScore} pts
                {hasPendingTimeBasedActivity && (
                  <span className="italic text-muted-foreground"> *</span>
                )}
              </div>
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
      </ClickableElement>

      {/* Discover the place: description + photos + fun facts. Withheld while
          the post is still redacted for the viewer — the gallery is a stronger
          reveal than the list entry, and on a peddy paper a photo of the venue
          is the answer. */}
      {!isRedacted && (
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
          {evaluationResults.map((result) => {
            const activity = result.activity;
            const isTimeBased = activity?.activity_type === "TimeBasedActivity";

            // Get count of teams that have completed this activity across ALL teams
            const completedCount = allEvaluations.filter(
              (r) => r.activity?.id === activity?.id && r.final_score != null,
            ).length;

            const isCompletionPending = isTimeBased && completedCount < totalTeams;

            return (
              <div
                key={result.activity?.id}
                className="rounded-xl border border-border bg-card/60 p-4 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="mb-1 text-base font-semibold">{activity?.name}</h4>
                    {activity?.description && (
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    )}
                    {isCompletionPending && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <ProvisionalBadge />
                        <span>
                          {completedCount} de {totalTeams} equipas terminaram (a pontuação recalcula
                          à medida que mais equipas terminam)
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 text-right">
                    <div className="mb-1 text-lg font-bold">
                      <span className={isCompletionPending ? "italic" : ""}>
                        {result.final_score?.toFixed(0)} pts
                      </span>
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
