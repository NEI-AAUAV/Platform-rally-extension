/**
 * Drains the offline GPS-arrival queue when connectivity returns.
 *
 * Mirrors {@link ./useOfflineSync} — same `online` / visibility / `pageshow`
 * triggers, because iOS kills backgrounded PWAs outright and the process that
 * queued an arrival may never see another `online` event. Replays carry the
 * coordinates captured at the post, so the server's geofence check still passes
 * even though the team has since walked on.
 */
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { arriveAtCheckpoint } from "@/client";
import {
  ARRIVAL_QUEUE_CHANGED_EVENT,
  drainArrivals,
  listArrivals,
  type QueuedArrival,
} from "./arrivalQueue";

async function replayOne(item: QueuedArrival): Promise<void> {
  await arriveAtCheckpoint({
    path: { checkpoint_id: item.checkpointId },
    body: { latitude: item.latitude, longitude: item.longitude },
  });
}

export interface ArrivalSync {
  /** Queued arrivals still waiting for (or having failed) a replay. */
  queued: QueuedArrival[];
  syncNow: () => Promise<void>;
}

export function useArrivalSync(): ArrivalSync {
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState<QueuedArrival[]>([]);

  const refresh = useCallback(async () => {
    setQueued(await listArrivals());
  }, []);

  const syncNow = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await refresh();
      return;
    }
    const synced = await drainArrivals(replayOne);
    await refresh();
    if (synced > 0) {
      // Progress moved server-side: refresh the team's route and position.
      await queryClient.invalidateQueries({ queryKey: ["team"] });
      await queryClient.invalidateQueries({ queryKey: ["checkpoints"] });
    }
  }, [queryClient, refresh]);

  useEffect(() => {
    void syncNow();
    const onSignal = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    const onQueueChanged = () => void refresh();

    window.addEventListener("online", onSignal);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener(ARRIVAL_QUEUE_CHANGED_EVENT, onQueueChanged);
    return () => {
      window.removeEventListener("online", onSignal);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener(ARRIVAL_QUEUE_CHANGED_EVENT, onQueueChanged);
    };
  }, [syncNow, refresh]);

  return { queued, syncNow };
}
