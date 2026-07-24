import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import config from "@/config";

const STREAM_URL = "/api/rally/v1/scoreboard/stream";

/**
 * Subscribe to the live scoreboard SSE stream.
 *
 * When the realtime subsystem is enabled, opens a Server-Sent Events
 * connection and invalidates the cached queries on every "refresh" push so the
 * leaderboard updates without polling. A no-op when EVENTS_ENABLED is off, and
 * it closes the connection on error (the endpoint returns 503 when the backend
 * subsystem is disabled) to avoid a reconnect loop.
 *
 * @param queryKeys - React Query keys to invalidate on each refresh.
 */
export default function useScoreboardStream(
  queryKeys: readonly (readonly unknown[])[] = [["teams"]],
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!config.EVENTS_ENABLED || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource(STREAM_URL);

    const handleRefresh = () => {
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    };

    source.addEventListener("refresh", handleRefresh);
    source.onerror = () => source.close();

    return () => {
      source.removeEventListener("refresh", handleRefresh);
      source.close();
    };
    // queryKeys is intentionally not in deps: callers pass an inline literal
    // each render, which would otherwise reopen the connection on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
