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
 *
 * `rank` must be the already-normalized display rank (see
 * `sortTeamsByRank`/`displayRank` in `@/lib/teamRanking`), not the raw
 * `team.classification` column — the server value can lag a score change and
 * disagrees with what `/scoreboard` and `/teams/:id` show, which would let
 * this hook announce a "climb" no other screen agrees happened. `null` means
 * unranked/unknown and never triggers a climb notification.
 */
export default function useTeamNotifications(
  team: DetailedTeam | undefined,
  rank: number | null,
): void {
  const toast = useAppToast();
  const terms = useEventTerms();
  const prevTeamId = useRef<number | null>(null);
  const prevRank = useRef<number | null>(null);
  const prevResolved = useRef<ReadonlySet<number> | null>(null);

  useEffect(() => {
    if (!team) return;

    // A different team (session/login change) must never compare its state
    // against the previous team's baseline — reseed instead of diffing.
    if (prevTeamId.current !== team.id) {
      prevTeamId.current = team.id;
      prevRank.current = rank;
      prevResolved.current = new Set(team.resolved_checkpoint_orders ?? []);
      return;
    }

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

    // Climbed the ranking (a smaller rank number is a better place). `null`
    // means unranked/unknown and never counts as a climb either way.
    if (
      prevRank.current !== null &&
      rank !== null &&
      prevRank.current > 0 &&
      rank > 0 &&
      rank < prevRank.current
    ) {
      toast.info(`Subiste para ${rank}º lugar!`);
    }

    prevRank.current = rank;
    prevResolved.current = new Set(resolved);
  }, [team, rank, toast, terms]);
}
