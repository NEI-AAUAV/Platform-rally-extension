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

/**
 * Subscribe to the raw rally events SSE stream (activity_result/team changes).
 *
 * Unlike useScoreboardStream (which only signals "leaderboard changed"), this
 * forwards every activity_result/team event so staff-evaluation, admin, and
 * team-progress views can invalidate their queries as soon as an evaluation
 * is submitted anywhere, instead of waiting on a manual refresh or a slow poll.
 *
 * A no-op when EVENTS_ENABLED is off; closes the connection on error (the
 * endpoint returns 503 when the backend subsystem is disabled) to avoid a
 * reconnect loop.
 *
 * @param queryKeys - React Query keys to invalidate on every rally event.
 */
export default function useRallyEventStream(queryKeys: readonly (readonly unknown[])[]): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!config.EVENTS_ENABLED || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource(STREAM_URL);

    const handleEvent = () => {
      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    };

    for (const eventName of RALLY_EVENT_NAMES) {
      source.addEventListener(eventName, handleEvent);
    }
    source.onerror = () => source.close();

    return () => {
      for (const eventName of RALLY_EVENT_NAMES) {
        source.removeEventListener(eventName, handleEvent);
      }
      source.close();
    };
    // queryKeys is intentionally not in deps: callers pass an inline literal
    // each render, which would otherwise reopen the connection on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
