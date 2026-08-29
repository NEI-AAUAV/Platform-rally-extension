import { useEffect, useState } from "react";
import { getExtraShotsConfig, getPenaltyValues } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useGlobalPenaltyCounters } from "@/hooks/useGlobalPenaltyCounters";
import { useAppToast } from "@/hooks/use-toast";
import { hasDrinkingMechanics as formatHasDrinkingMechanics } from "@/lib/eventTerms";
import { getTeamSize } from "@/types/forms";
import type { BaseActivityFormProps } from "@/types/forms";
import type { PenaltyCounterConfig, PenaltyCountMap } from "@/lib/penaltyCounters";

type PenaltyMap = PenaltyCountMap;

export interface UseExtraShotsAndPenaltiesResult {
  extraShots: number;
  setExtraShots: (value: number) => void;
  /**
   * Occurrence counts, bound to the input fields — "2 vomits", not
   * "-20 points". Submit these as `penalty_counts`: the server prices them.
   * The client no longer computes point totals at all (see
   * `lib/penaltyCounters.ts`).
   */
  penalties: PenaltyMap;
  setPenalties: (value: PenaltyMap) => void;
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

  // Prices are shown to staff ("3 pts cada") but never applied here: the
  // server is what multiplies count by price. The form only collects counts.
  const penaltyValues = getPenaltyValues(settings);

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
      // The server stores the counts staff entered alongside the priced
      // points, so an edit shows the real count. It used to be reverse-derived
      // by dividing the stored points by the *current* price, which rewrote
      // the count whenever an admin changed that price.
      setPenalties(existingResult.penalty_counts || {});
    }
    // Only re-derive when the result identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingResult]);

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
