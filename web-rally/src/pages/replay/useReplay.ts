import { useQuery } from "@tanstack/react-query";
import { ScoreboardService } from "@/client";
import { buildReplayFrames, type ReplayEntry, type ReplayFrame } from "@/lib/replayFrames";

/**
 * Fetch the current event's score timeline and turn it into ranked frames for
 * the leaderboard replay. The timeline is immutable once an event is over, so
 * it is cached aggressively.
 */
export default function useReplay(): {
  frames: ReplayFrame[];
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scoreboard-replay"],
    queryFn: async (): Promise<ReplayFrame[]> => {
      const entries =
        (await ScoreboardService.getScoreboardReplayApiRallyV1ScoreboardReplayGet()) as ReplayEntry[];
      return buildReplayFrames(entries);
    },
    staleTime: 60_000,
  });

  return { frames: data ?? [], isLoading, error };
}
