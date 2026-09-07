import { useEffect, useState } from "react";
import {
  getDefaultMaxBonusPoints,
  getExtraShotsConfig,
  getPenaltyValues,
} from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useGlobalBonusCounters } from "@/hooks/useGlobalBonusCounters";
import { useGlobalPenaltyCounters } from "@/hooks/useGlobalPenaltyCounters";
import { useAppToast } from "@/hooks/use-toast";
import { hasDrinkingMechanics as formatHasDrinkingMechanics } from "@/lib/eventTerms";
import { getTeamSize } from "@/types/forms";
import type { BaseActivityFormProps } from "@/types/forms";
import type {
  BonusCountMap,
  BonusCounterConfig,
  PenaltyCounterConfig,
  PenaltyCountMap,
} from "@/lib/penaltyCounters";

type PenaltyMap = PenaltyCountMap;
type BonusMap = BonusCountMap;

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
  /**
   * Bonus occurrence counts, the additive mirror of `penalties`. Submit as
   * `bonus_counts`; the server prices them and applies `max_bonus_points`.
   */
  bonuses: BonusMap;
  setBonuses: (value: BonusMap) => void;
  showBonuses: boolean;
  /** This activity's own counters (from config.bonus_counters), if any. */
  bonusCounters: readonly BonusCounterConfig[];
  globalBonusCounters: readonly BonusCounterConfig[];
  /**
   * Ceiling on the summed bonus, already resolved: the activity's own when it
   * sets one, else the event default. undefined = no ceiling anywhere.
   */
  maxBonusPoints?: number;
  /** Points the entered counts are worth, before the cap — for display. */
  bonusTotal: number;
  validateExtraShots: () => boolean;
}

export function useExtraShotsAndPenalties(
  team: BaseActivityFormProps["team"],
  existingResult: BaseActivityFormProps["existingResult"],
  penaltyCounters: readonly PenaltyCounterConfig[] = [],
  bonusCounters: readonly BonusCounterConfig[] = [],
  maxBonusPoints?: number,
): UseExtraShotsAndPenaltiesResult {
  const [extraShots, setExtraShots] = useState<number>(0);
  const [penalties, setPenalties] = useState<PenaltyMap>({});
  const [bonuses, setBonuses] = useState<BonusMap>({});
  const toast = useAppToast();
  const { settings } = useRallySettings();
  const { globalPenaltyCounters } = useGlobalPenaltyCounters();
  const { globalBonusCounters } = useGlobalBonusCounters();

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

  // A performance bonus is not a drinking mechanic, so it is not gated on the
  // event format the way extra shots are — only on something being configured.
  const showBonuses = bonusCounters.length > 0 || globalBonusCounters.length > 0;

  // The activity's own ceiling wins when it sets one; otherwise the event's
  // default applies. Tested against undefined rather than falsiness so a
  // configured 0 stays a real ceiling instead of falling through — the same
  // precedence ScoringService._resolve_bonus_cap applies server-side, which is
  // what actually truncates. This copy only drives the display and the warning.
  const effectiveMaxBonusPoints = maxBonusPoints ?? getDefaultMaxBonusPoints(settings);

  const allBonusCounters = [...bonusCounters, ...globalBonusCounters];
  const bonusTotal = allBonusCounters.reduce(
    (sum, counter) => sum + (bonuses[counter.key] ?? 0) * counter.points,
    0,
  );

  useEffect(() => {
    if (existingResult) {
      setExtraShots(existingResult.extra_shots || 0);
      // The server stores the counts staff entered alongside the priced
      // points, so an edit shows the real count. It used to be reverse-derived
      // by dividing the stored points by the *current* price, which rewrote
      // the count whenever an admin changed that price.
      setPenalties(existingResult.penalty_counts || {});
      setBonuses(existingResult.bonus_counts || {});
    }
    // Only re-derive when the result identity changes.
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
    bonuses,
    setBonuses,
    showBonuses,
    bonusCounters,
    globalBonusCounters,
    maxBonusPoints: effectiveMaxBonusPoints,
    bonusTotal,
    validateExtraShots,
  };
}

export function getSubmitLabel(isSubmitting: boolean, hasExisting: boolean): string {
  if (isSubmitting) return "A guardar...";
  return hasExisting ? "Atualizar avaliação" : "Submeter avaliação";
}
