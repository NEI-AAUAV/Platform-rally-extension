import { useQuery } from "@tanstack/react-query";
import { getCheckpointsCount } from "@/client";
import useRallySettings from "@/hooks/useRallySettings";

interface UseHiddenCheckpointsOptions {
  /** How many posts the checkpoint list endpoint returned to this viewer. */
  readonly visibleCount: number;
  /** Caller-side gate (e.g. not staff, list actually shown). */
  readonly enabled: boolean;
}

/**
 * Whether a focused route is withholding posts from this viewer.
 *
 * In ``focused`` mode the list endpoint returns only what the team has
 * finished plus what is open now (or just the first post for the public),
 * so a one-item list reads as the whole route. The published total, minus
 * what was listed, says more is still to come.
 */
export default function useHiddenCheckpoints({
  visibleCount,
  enabled,
}: UseHiddenCheckpointsOptions): boolean {
  const { settings } = useRallySettings();
  const isFocusedRoute = settings != null && settings.show_route_mode !== "complete";
  const isActive = enabled && isFocusedRoute;

  const { data: totalCheckpoints } = useQuery({
    queryKey: ["checkpoints", "count"],
    queryFn: async () => {
      const { data } = await getCheckpointsCount();
      return data;
    },
    retry: false,
    enabled: isActive,
  });

  return isActive && typeof totalCheckpoints === "number" && totalCheckpoints > visibleCount;
}
