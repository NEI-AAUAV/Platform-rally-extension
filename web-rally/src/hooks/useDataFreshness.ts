import { useEffect, useState } from "react";

const TICK_MS = 5_000;

/**
 * Given a query's `dataUpdatedAt` epoch (ms), returns how many whole seconds
 * ago the data was last refreshed, re-evaluated on a fixed interval so the
 * value stays current without re-rendering on every frame.
 *
 * @param dataUpdatedAt - epoch ms of the last successful fetch (0 when never).
 * @returns seconds since last update, or null when there is no update yet.
 */
export default function useDataFreshness(dataUpdatedAt: number): number | null {
  const [secondsAgo, setSecondsAgo] = useState<number | null>(() =>
    dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : null,
  );

  useEffect(() => {
    if (!dataUpdatedAt) {
      setSecondsAgo(null);
      return;
    }

    const compute = () => setSecondsAgo(Math.floor((Date.now() - dataUpdatedAt) / 1000));
    compute();
    const id = window.setInterval(compute, TICK_MS);
    return () => window.clearInterval(id);
  }, [dataUpdatedAt]);

  return secondsAgo;
}
