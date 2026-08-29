import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import config from "@/config";

const STREAM_URL = "/api/rally/v1/scoreboard/stream";

/**
 * Subscribe to the live scoreboard SSE stream.
 *
 * When the realtime subsystem is enabled, opens a Server-Sent Events
 * connection and invalidates the cached queries on every "refresh" push so the
 * leaderboard updates without polling. A no-op when EVENTS_ENABLED is off.
 *
 * On error the connection is closed and retried with exponential backoff.
 * It used to close permanently on the first error, which meant a single
 * blip — a proxy dropping an idle connection, a brief backend restart — left
 * the board with no live updates at all for the rest of the session, falling
 * back silently to the 5-minute global staleTime with no visible signal that
 * it had gone stale. The backoff is capped and gives up after a fixed number
 * of attempts, so a genuinely disabled endpoint (503) still stops retrying
 * rather than looping.
 *
 * @param queryKeys - React Query keys to invalidate on each refresh.
 */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 6;

export default function useScoreboardStream(
  queryKeys: readonly (readonly unknown[])[] = [["teams"]],
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!config.EVENTS_ENABLED || typeof EventSource === "undefined") {
      return;
    }

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let closed = false;

    const handleRefresh = () => {
      // A message means the connection is healthy again: reset the backoff so
      // a later blip starts from the short delay, not the long one.
      attempts = 0;
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    };

    const connect = () => {
      if (closed) return;
      const es = new EventSource(STREAM_URL);
      source = es;
      es.addEventListener("refresh", handleRefresh);
      es.onerror = () => {
        es.removeEventListener("refresh", handleRefresh);
        es.close();
        if (closed || attempts >= RECONNECT_MAX_ATTEMPTS) return;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
        attempts += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      source?.removeEventListener("refresh", handleRefresh);
      source?.close();
    };
    // queryKeys is intentionally not in deps: callers pass an inline literal
    // each render, which would otherwise reopen the connection on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
