import { useEffect, useMemo, useState } from "react";
import { getExtraShotsConfig, getPenaltyValues } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useGlobalPenaltyCounters } from "@/hooks/useGlobalPenaltyCounters";
import { useAppToast } from "@/hooks/use-toast";
import { hasDrinkingMechanics as formatHasDrinkingMechanics } from "@/lib/eventTerms";
import { getTeamSize } from "@/types/forms";
import type { BaseActivityFormProps } from "@/types/forms";
import {
  buildPenaltyRates,
  countsToPoints,
  pointsToCounts,
  type PenaltyCounterConfig,
  type PenaltyCountMap,
} from "@/lib/penaltyCounters";

type PenaltyMap = PenaltyCountMap;

export interface UseExtraShotsAndPenaltiesResult {
  extraShots: number;
  setExtraShots: (value: number) => void;
  /** Raw counts, bound to the input fields — "2 vomits", not "-20 points". */
  penalties: PenaltyMap;
  setPenalties: (value: PenaltyMap) => void;
  /**
   * The same counts converted to the point totals the backend scores with.
   * Pass this, not `penalties`, in the submitted `result_data` — see
   * `lib/penaltyCounters.ts` for why the two must never be conflated.
   */
  penaltiesInPoints: PenaltyMap;
  maxExtraShots: number;
  maxExtraShotsPerMember: number;
  showExtraShots: boolean;
  penaltyValues: { vomit: number; not_drinking: number };
  showVomitPenalty: boolean;
  showNotDrinkingPenalty: boolean;
  showPenalties: boolean;
  /** This activity's own counters (from config.penalty_counters), if any. */
  penaltyCounters: readonly PenaltyCounterConfig[];
  /** Counters that apply at every checkpoint (admin-defined DynamicRule rows). */
  globalPenaltyCounters: readonly PenaltyCounterConfig[];
  validateExtraShots: () => boolean;
}

export function useExtraShotsAndPenalties(
  team: BaseActivityFormProps["team"],
  existingResult: BaseActivityFormProps["existingResult"],
  penaltyCounters: readonly PenaltyCounterConfig[] = [],
): UseExtraShotsAndPenaltiesResult {
  const [extraShots, setExtraShots] = useState<number>(0);
  const [penalties, setPenalties] = useState<PenaltyMap>({});
  const toast = useAppToast();
  const { settings } = useRallySettings();
  const { globalPenaltyCounters } = useGlobalPenaltyCounters();

  const teamSize = getTeamSize(team);
  const extraShotsConfig = getExtraShotsConfig(settings);
  const maxExtraShotsPerMember = extraShotsConfig.perMember;
  const maxExtraShots = teamSize * maxExtraShotsPerMember;

  const penaltyValues = getPenaltyValues(settings);
  const rates = useMemo(
    () =>
      buildPenaltyRates(
        {
          vomit: Math.abs(penaltyValues.vomit),
          not_drinking: Math.abs(penaltyValues.not_drinking),
        },
        // Both counter sets are scored identically; only the form groups them.
        [...penaltyCounters, ...globalPenaltyCounters],
      ),
    [penaltyValues.vomit, penaltyValues.not_drinking, penaltyCounters, globalPenaltyCounters],
  );

  // Drinking mechanics belong to the pub-crawl format; the settings page gates
  // the same fields on the same predicate.
  const hasDrinkingMechanics = formatHasDrinkingMechanics(settings?.event_type);

  // Penalty amounts are stored negative (the backend applies `abs()`), so
  // "configured" means non-zero, not positive. Gating on `> 0` hid the fields
  // for every event using the seeded default of -10.
  const showExtraShots = hasDrinkingMechanics && maxExtraShots > 0;
  const showVomitPenalty = hasDrinkingMechanics && penaltyValues.vomit !== 0;
  const showNotDrinkingPenalty = hasDrinkingMechanics && penaltyValues.not_drinking !== 0;
  const showPenalties =
    showVomitPenalty ||
    showNotDrinkingPenalty ||
    penaltyCounters.length > 0 ||
    globalPenaltyCounters.length > 0;

  useEffect(() => {
    if (existingResult) {
      setExtraShots(existingResult.extra_shots || 0);
      // Stored value is points; the count fields need the count back.
      setPenalties(pointsToCounts(existingResult.penalties || {}, rates));
    }
    // Only re-derive when the result identity changes — `rates` recomputing
    // (e.g. settings refetch) must not reset what the staff already typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingResult]);

  const penaltiesInPoints = useMemo(() => countsToPoints(penalties, rates), [penalties, rates]);

  const validateExtraShots = (): boolean => {
    if (extraShots > maxExtraShots) {
      toast.error(
        `Os shots extra não podem exceder ${maxExtraShots} (${maxExtraShotsPerMember} por membro da equipa)`,
      );
      return false;
    }
    return true;
  };

  return {
    extraShots,
    setExtraShots,
    penalties,
    setPenalties,
    penaltiesInPoints,
    maxExtraShots,
    maxExtraShotsPerMember,
    showExtraShots,
    penaltyValues,
    showVomitPenalty,
    showNotDrinkingPenalty,
    showPenalties,
    penaltyCounters,
    globalPenaltyCounters,
    validateExtraShots,
  };
}

export function getSubmitLabel(isSubmitting: boolean, hasExisting: boolean): string {
  if (isSubmitting) return "A guardar...";
  return hasExisting ? "Atualizar avaliação" : "Submeter avaliação";
}
