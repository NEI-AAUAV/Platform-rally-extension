import { useQuery } from "@tanstack/react-query";
import { listDynamicRules } from "@/client";
import type { BonusCounterConfig } from "@/lib/penaltyCounters";

/**
 * Global bonus counters — DynamicRule rows the admin defines once and that
 * apply at *every* checkpoint ("cada momento de criatividade = +3").
 *
 * The additive mirror of useGlobalPenaltyCounters: the staff form collects a
 * count, the server prices it and files it under the `gb_<id>` key in
 * `ActivityResult.bonuses`, which `BaseActivity.apply_modifiers` adds. The
 * `gb_` prefix is deliberately distinct from a penalty rule's `g_`, so the two
 * namespaces can never collide even for the same rule id.
 *
 * Only active bonus rules are returned; a deactivated rule stops showing in
 * the form, but results already scored with it keep the award.
 */
const GLOBAL_BONUS_KEY_PREFIX = "gb_";
const BONUS_RULE_TYPE = "bonus_counter";

export function globalBonusKey(ruleId: number): string {
  return `${GLOBAL_BONUS_KEY_PREFIX}${ruleId}`;
}

export function useGlobalBonusCounters(): {
  globalBonusCounters: readonly BonusCounterConfig[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["dynamic-rules", "global-bonus-counters"],
    queryFn: async (): Promise<BonusCounterConfig[]> => {
      const { data } = await listDynamicRules();
      return (data ?? [])
        .filter((rule) => rule.is_active && rule.rule_type === BONUS_RULE_TYPE)
        .map((rule) => ({
          key: globalBonusKey(rule.id),
          label: rule.name,
          points: Math.abs(rule.points),
          // A rule with no ceiling of its own stays unlimited; the checkpoint's
          // total cap still applies on top.
          maxPoints: rule.max_points ?? undefined,
        }));
    },
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });

  return { globalBonusCounters: data ?? [], isLoading };
}

export default useGlobalBonusCounters;
