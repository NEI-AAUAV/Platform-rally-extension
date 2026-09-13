import type { CheckpointProgress } from "@/client";

type WithCheckpoints = { checkpoints?: CheckpointProgress[] | null };

/**
 * A team's progress at one post, looked up by the post's stable id.
 *
 * `team.times` is a visit-order log and `team.score_per_checkpoint` a
 * route-order layout, so indexing either by `order - 1` pairs a post with
 * another post's data as soon as a team visits out of sequence or the route
 * is reordered. `team.checkpoints` is keyed by `checkpoint_id` instead.
 */
export function findCheckpointProgress(
  team: WithCheckpoints | null | undefined,
  checkpointId: number,
): CheckpointProgress | undefined {
  return team?.checkpoints?.find((row) => row.checkpoint_id === checkpointId);
}

/** Points scored at this post, 0 when unscored or hidden. */
export function checkpointScoreFor(
  team: WithCheckpoints | null | undefined,
  checkpointId: number,
): number {
  return findCheckpointProgress(team, checkpointId)?.score ?? 0;
}

/** When the team arrived at this post, or null if it never did. */
export function checkpointArrivedAt(
  team: WithCheckpoints | null | undefined,
  checkpointId: number,
): string | null {
  return findCheckpointProgress(team, checkpointId)?.arrived_at ?? null;
}
