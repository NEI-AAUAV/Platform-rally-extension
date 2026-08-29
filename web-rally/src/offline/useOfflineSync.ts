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
    // Counts, priced server-side — same contract as the online submit.
    penalty_counts: item.resultData?.penalty_counts ?? {},
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
    // Replayed evaluations changed team totals, so the standings key has to go
    // too — otherwise the scoreboard keeps the pre-sync ranking.
    await queryClient.invalidateQueries({ queryKey: ["teams"] });
  }, [queryClient]);

  // Every trigger below is fire-and-forget, so a rejected drain (storage
  // unavailable, an IndexedDB upgrade blocked by another tab) would surface as
  // an unhandled promise rejection in the console rather than as anything the
  // user can act on. The queue is durable and the next trigger retries, so log
  // and move on.
  const runSync = useCallback(() => {
    syncNow().catch((error: unknown) => {
      console.warn("Offline eval queue drain failed; will retry.", error);
    });
  }, [syncNow]);

  useEffect(() => {
    runSync();
    const onOnline = () => runSync();
    // iOS kills backgrounded PWAs outright, so the process that queued an item
    // may never see another `online` event. Retrying whenever the app comes
    // back to the foreground covers the kill/relaunch cycle. `syncNow` already
    // no-ops when offline, so no extra guard is needed here.
    const onVisible = () => {
      if (document.visibilityState === "visible") runSync();
    };
    // Background Sync (Chrome only) wakes the service worker, which cannot
    // replay by itself — the auth token and the SDK live here — so it asks the
    // page to drain instead. Purely additive: every listener above still fires
    // on its own, and drain() is idempotency-keyed, so a doubled run is safe.
    const onSwMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === "DRAIN_EVAL_QUEUE") {
        runSync();
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [runSync]);

  return { syncNow };
}
