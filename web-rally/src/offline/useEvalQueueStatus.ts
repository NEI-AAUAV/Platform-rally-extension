/**
 * Reactive view of the offline evaluation queue for UI badges.
 *
 * Refreshes immediately on the queue's own change event (fired by
 * evalQueue's mutate()) plus the `online`/`offline`/focus signals that
 * bracket a sync, with a polling fallback in case an event is ever missed.
 */
import { useCallback, useEffect, useState } from "react";
import { list, QUEUE_CHANGED_EVENT, type QueuedEval } from "./evalQueue";

const POLL_MS = 4000;

export interface EvalQueueStatus {
  items: QueuedEval[];
  pending: number;
  failed: number;
  refresh: () => Promise<void>;
}

export function useEvalQueueStatus(): EvalQueueStatus {
  const [items, setItems] = useState<QueuedEval[]>([]);

  const refresh = useCallback(async () => {
    setItems(await list());
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onSignal = () => void refresh();
    window.addEventListener("online", onSignal);
    window.addEventListener("offline", onSignal);
    window.addEventListener("focus", onSignal);
    window.addEventListener(QUEUE_CHANGED_EVENT, onSignal);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onSignal);
      window.removeEventListener("offline", onSignal);
      window.removeEventListener("focus", onSignal);
      window.removeEventListener(QUEUE_CHANGED_EVENT, onSignal);
    };
  }, [refresh]);

  return {
    items,
    pending: items.filter((i) => i.status === "pending").length,
    failed: items.filter((i) => i.status === "failed").length,
    refresh,
  };
}
