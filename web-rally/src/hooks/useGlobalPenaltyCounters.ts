import { useQuery } from "@tanstack/react-query";
import { listDynamicRules } from "@/client";
import type { PenaltyCounterConfig } from "@/lib/penaltyCounters";

/**
 * Global penalty counters — DynamicRule rows the admin defines once and that
 * apply at *every* checkpoint ("cada atraso = -10", "cada reclamação = -5").
 *
 * They reach scoring exactly like an activity's own `config.penalty_counters`:
 * the staff form multiplies the entered count by `points` and submits the
 * total under the `g_<id>` key in `ActivityResult.penalties`, which
 * `BaseActivity.apply_modifiers` subtracts. The `g_` prefix keeps them from
 * colliding with an activity counter's `slugify(label)` key.
 *
 * Only active rules are returned — a deactivated rule stops showing in the
 * form, but results already scored with it keep the deduction.
 */
const GLOBAL_COUNTER_KEY_PREFIX = "g_";

export function globalCounterKey(ruleId: number): string {
  return `${GLOBAL_COUNTER_KEY_PREFIX}${ruleId}`;
}

export function useGlobalPenaltyCounters(): {
  globalPenaltyCounters: readonly PenaltyCounterConfig[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["dynamic-rules", "global-penalty-counters"],
    queryFn: async (): Promise<PenaltyCounterConfig[]> => {
      const { data } = await listDynamicRules();
      return (data ?? [])
        .filter((rule) => rule.is_active)
        .map((rule) => ({
          key: globalCounterKey(rule.id),
          label: rule.name,
          points: Math.abs(rule.points),
        }));
    },
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });

  return { globalPenaltyCounters: data ?? [], isLoading };
}

export default useGlobalPenaltyCounters;
