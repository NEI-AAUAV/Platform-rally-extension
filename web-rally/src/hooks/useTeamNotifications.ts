import { useEffect, useRef } from "react";
import type { DetailedTeam } from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import useEventTerms from "@/hooks/useEventTerms";

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
  const terms = useEventTerms();
  const prevRank = useRef<number | null>(null);
  const prevResolved = useRef<ReadonlySet<number> | null>(null);

  useEffect(() => {
    if (!team) return;

    const rank = team.classification;
    const resolved = team.resolved_checkpoint_orders ?? [];

    // Newly resolved orders since the last observation. Uses a set diff
    // (not last_checkpoint_number, a sequential-prefix pointer) so free-order
    // and free-choice routes — where resolution isn't strictly sequential —
    // still surface a notification.
    if (prevResolved.current) {
      const newlyResolved = resolved.filter((order) => !prevResolved.current!.has(order));
      // A reconnect/refresh can reveal many at once; announce a summary
      // instead of one toast per order to avoid a notification avalanche.
      if (newlyResolved.length === 1) {
        toast.success(`${terms.checkpoint} ${newlyResolved[0]} resolvido!`);
      } else if (newlyResolved.length > 1) {
        toast.success(`${newlyResolved.length} ${terms.checkpoints} resolvidos!`);
      }
    }

    // Climbed the ranking (a smaller classification number is a better place).
    // Guard against the unranked sentinel (-1) so seeding into a real rank is
    // not announced as a climb.
    if (prevRank.current !== null && prevRank.current > 0 && rank > 0 && rank < prevRank.current) {
      toast.info(`Subiste para ${rank}º lugar!`);
    }

    prevRank.current = rank;
    prevResolved.current = new Set(resolved);
  }, [team, toast, terms]);
}
