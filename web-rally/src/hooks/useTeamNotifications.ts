import { useEffect, useRef } from "react";
import type { DetailedTeam } from "@/client";
import { useAppToast } from "@/hooks/use-toast";

/**
 * Surface in-app notifications as the team's standing changes.
 *
 * Derived purely from data the team views already poll/stream (rank +
 * checkpoint), so there is no extra backend channel: when the team advances a
 * checkpoint or climbs the ranking, a toast announces it. The first observation
 * only seeds the baseline — it never fires, so reopening the page is quiet.
 */
export default function useTeamNotifications(team: DetailedTeam | undefined): void {
  const toast = useAppToast();
  const prevRank = useRef<number | null>(null);
  const prevCheckpoint = useRef<number | null>(null);

  useEffect(() => {
    if (!team) return;

    const rank = team.classification;
    const checkpoint = team.last_checkpoint_number ?? 0;

    // Checkpoint advanced.
    if (prevCheckpoint.current !== null && checkpoint > prevCheckpoint.current) {
      toast.success(`Chegaste ao posto ${checkpoint}!`);
    }

    // Climbed the ranking (a smaller classification number is a better place).
    // Guard against the unranked sentinel (-1) so seeding into a real rank is
    // not announced as a climb.
    if (prevRank.current !== null && prevRank.current > 0 && rank > 0 && rank < prevRank.current) {
      toast.info(`Subiste para ${rank}º lugar!`);
    }

    prevRank.current = rank;
    prevCheckpoint.current = checkpoint;
  }, [team, toast]);
}
