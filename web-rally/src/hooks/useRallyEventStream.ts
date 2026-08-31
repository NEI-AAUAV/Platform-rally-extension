import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import config from "@/config";

const STREAM_URL = "/api/rally/v1/events/stream";

// Mirrors api-rally's Channels class (activity_result.* and team.* events).
const RALLY_EVENT_NAMES = [
  "rally.activity_result.created",
  "rally.activity_result.updated",
  "rally.activity_result.deleted",
  "rally.team.score_updated",
  "rally.team.checkpoint_advanced",
] as const;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 6;

/**
 * Subscribe to the raw rally events SSE stream (activity_result/team changes).
 *
 * Unlike useScoreboardStream (which only signals "leaderboard changed"), this
 * forwards every activity_result/team event so staff-evaluation, admin, and
 * team-progress views can invalidate their queries as soon as an evaluation
 * is submitted anywhere, instead of waiting on a manual refresh or a slow poll.
 *
 * A no-op when EVENTS_ENABLED is off. On error the connection is retried with
 * capped exponential backoff — mirrors useScoreboardStream's fix (M9): this
 * used to close permanently on the first error, so a single network blip
 * killed live refresh of the staff evaluation screen for the rest of the
 * session with nothing to signal it had gone stale. A genuinely disabled
 * endpoint (503) still stops retrying after RECONNECT_MAX_ATTEMPTS.
 *
 * @param queryKeys - React Query keys to invalidate on every rally event.
 */
export default function useRallyEventStream(queryKeys: readonly (readonly unknown[])[]): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!config.EVENTS_ENABLED || typeof EventSource === "undefined") {
      return;
    }

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let closed = false;

    const handleEvent = () => {
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
      for (const eventName of RALLY_EVENT_NAMES) {
        es.addEventListener(eventName, handleEvent);
      }
      es.onerror = () => {
        for (const eventName of RALLY_EVENT_NAMES) {
          es.removeEventListener(eventName, handleEvent);
        }
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
      for (const eventName of RALLY_EVENT_NAMES) {
        source?.removeEventListener(eventName, handleEvent);
      }
      source?.close();
    };
    // queryKeys is intentionally not in deps: callers pass an inline literal
    // each render, which would otherwise reopen the connection on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
