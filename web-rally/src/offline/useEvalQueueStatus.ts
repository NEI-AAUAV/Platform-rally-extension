/**
 * Reactive view of the offline evaluation queue for UI badges.
 *
 * idb-keyval has no change events, so we poll on an interval plus refresh on
 * the `online`/`offline` and window-focus signals that bracket a sync.
 */
import { useCallback, useEffect, useState } from "react";
import { list, type QueuedEval } from "./evalQueue";

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
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onSignal);
      window.removeEventListener("offline", onSignal);
      window.removeEventListener("focus", onSignal);
    };
  }, [refresh]);

  return {
    items,
    pending: items.filter((i) => i.status === "pending").length,
    failed: items.filter((i) => i.status === "failed").length,
    refresh,
  };
}
