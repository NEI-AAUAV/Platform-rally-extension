import { useEffect, useState } from "react";
import { getExtraShotsConfig, getPenaltyValues } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useAppToast } from "@/hooks/use-toast";
import { getTeamSize } from "@/types/forms";
import type { BaseActivityFormProps } from "@/types/forms";

type PenaltyMap = { [key: string]: number };

export interface UseExtraShotsAndPenaltiesResult {
  extraShots: number;
  setExtraShots: (value: number) => void;
  penalties: PenaltyMap;
  setPenalties: (value: PenaltyMap) => void;
  maxExtraShots: number;
  maxExtraShotsPerMember: number;
  showExtraShots: boolean;
  penaltyValues: { vomit: number; not_drinking: number };
  showVomitPenalty: boolean;
  showNotDrinkingPenalty: boolean;
  showPenalties: boolean;
  validateExtraShots: () => boolean;
}

export function useExtraShotsAndPenalties(
  team: BaseActivityFormProps["team"],
  existingResult: BaseActivityFormProps["existingResult"],
): UseExtraShotsAndPenaltiesResult {
  const [extraShots, setExtraShots] = useState<number>(0);
  const [penalties, setPenalties] = useState<PenaltyMap>({});
  const toast = useAppToast();
  const { settings } = useRallySettings();

  const teamSize = getTeamSize(team);
  const extraShotsConfig = getExtraShotsConfig(settings);
  const maxExtraShotsPerMember = extraShotsConfig.perMember;
  const maxExtraShots = teamSize * maxExtraShotsPerMember;

  const penaltyValues = getPenaltyValues(settings);

  const showExtraShots = maxExtraShots > 0;
  const showVomitPenalty = penaltyValues.vomit > 0;
  const showNotDrinkingPenalty = penaltyValues.not_drinking > 0;
  const showPenalties = showVomitPenalty || showNotDrinkingPenalty;

  useEffect(() => {
    if (existingResult) {
      setExtraShots(existingResult.extra_shots || 0);
      setPenalties(existingResult.penalties || {});
    }
  }, [existingResult]);

  const validateExtraShots = (): boolean => {
    if (extraShots > maxExtraShots) {
      toast.error(
        `Extra shots cannot exceed ${maxExtraShots} (${maxExtraShotsPerMember} per team member)`,
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
    validateExtraShots,
  };
}

export function getSubmitLabel(isSubmitting: boolean, hasExisting: boolean): string {
  if (isSubmitting) return "Saving...";
  return hasExisting ? "Update Evaluation" : "Submit Evaluation";
}
