/**
 * Drains the offline evaluation queue when connectivity returns.
 *
 * Listens for the browser `online` event (and drains once on mount if already
 * online). Each queued submit is replayed through the same SDK call with its
 * original `Idempotency-Key`, so a submit that actually reached the server
 * before the device dropped is recognized as a duplicate rather than re-scored.
 */
import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { evaluateTeamActivity, type ActivityResultEvaluation } from "@/client";
import { drain, type QueuedEval } from "./evalQueue";

async function replayOne(item: QueuedEval): Promise<void> {
  const payload: ActivityResultEvaluation = {
    result_data: item.resultData?.result_data ?? {},
    extra_shots: item.resultData?.extra_shots ?? 0,
    penalties: item.resultData?.penalties ?? {},
  };
  await evaluateTeamActivity({
    path: { team_id: item.teamId, activity_id: item.activityId },
    body: payload,
    headers: { "Idempotency-Key": item.idempotencyKey },
  });
}

export function useOfflineSync(): { syncNow: () => Promise<void> } {
  const queryClient = useQueryClient();

  const syncNow = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    await drain(replayOne);
    // Refresh evaluation-derived views after a batch replay.
    await queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
    await queryClient.invalidateQueries({ queryKey: ["allEvaluations"] });
    await queryClient.invalidateQueries({ queryKey: ["checkpointTeams"] });
  }, [queryClient]);

  useEffect(() => {
    void syncNow();
    const onOnline = () => void syncNow();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncNow]);

  return { syncNow };
}
