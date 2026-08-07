import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCheckpointHints,
  listTeamHints,
  revealCheckpointHint,
  type HintReveal,
  type TeamHintSummary,
  type TeamHints,
} from "@/client";
import useTeamAuth from "@/hooks/useTeamAuth";

/**
 * A checkpoint's hint ladder from the team's point of view: the hints already
 * paid for, how many are left, and what the next one costs.
 *
 * Only teams have a hint economy, so the query stays idle without a team
 * session rather than 401-ing on every render for staff and public visitors.
 */
export function useCheckpointHints(checkpointId: number, enabled = true) {
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();
  const qc = useQueryClient();
  const queryKey = ["checkpoint-hints", checkpointId];

  const { data, isLoading } = useQuery<TeamHints>({
    queryKey,
    queryFn: async () =>
      (await listCheckpointHints({ path: { checkpoint_id: checkpointId } })).data,
    enabled: enabled && isTeamAuthenticated,
    staleTime: 30_000,
  });

  // What the team has spent on hints across the whole event. The
  // per-checkpoint listing above only covers this post, and the awards that
  // carry the charges are admin-only, so this is the team's only running total.
  const { data: summary } = useQuery<TeamHintSummary>({
    queryKey: ["team-hints"],
    queryFn: async () => (await listTeamHints()).data,
    enabled: enabled && isTeamAuthenticated,
    staleTime: 30_000,
  });

  const reveal = useMutation<HintReveal>({
    mutationFn: async () =>
      (await revealCheckpointHint({ path: { checkpoint_id: checkpointId } })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["team-hints"] });
      // Buying a hint costs points, so the team's own score is now stale.
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  return {
    revealed: data?.revealed ?? [],
    remaining: data?.remaining ?? 0,
    nextCost: data?.next_cost ?? 0,
    totalSpentInEvent: summary?.total_spent ?? 0,
    isLoading,
    reveal,
  };
}

export default useCheckpointHints;
