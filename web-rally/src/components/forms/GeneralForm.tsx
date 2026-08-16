import { useState, useEffect, type FormEvent } from "react";
import { RALLY_DEFAULTS } from "@/config/rallyDefaults";
import { useExtraShotsAndPenalties, getSubmitLabel } from "@/hooks/useExtraShotsAndPenalties";
import { useAppToast } from "@/hooks/use-toast";
import ExtraShotsField from "@/components/forms/shared/ExtraShotsField";
import PenaltiesFieldset from "@/components/forms/shared/PenaltiesFieldset";
import NotesField from "@/components/forms/shared/NotesField";
import FormSubmitButton from "@/components/forms/shared/FormSubmitButton";
import type { GeneralFormProps } from "@/types/forms";

// Helper function to safely extract default_points from config
function getDefaultPoints(config: GeneralFormProps["config"]): number {
  const defaultPoints = config.default_points;
  if (typeof defaultPoints === "number") {
    return defaultPoints;
  }
  return RALLY_DEFAULTS.FORM_DEFAULTS.generalPoints;
}

export default function GeneralForm({
  existingResult,
  team,
  config,
  onSubmit,
  isSubmitting,
  penaltyCounters = [],
}: Readonly<GeneralFormProps>) {
  const [assignedPoints, setAssignedPoints] = useState<number>(getDefaultPoints(config));
  const [notes, setNotes] = useState<string>("");
  const toast = useAppToast();

  const {
    extraShots,
    setExtraShots,
    penalties,
    penaltiesInPoints,
    setPenalties,
    maxExtraShots,
    maxExtraShotsPerMember,
    showExtraShots,
    penaltyValues,
    showVomitPenalty,
    showNotDrinkingPenalty,
    showPenalties,
    validateExtraShots,
  } = useExtraShotsAndPenalties(team, existingResult, penaltyCounters);

  useEffect(() => {
    if (existingResult?.result_data) {
      setAssignedPoints(
        (existingResult.result_data.assigned_points as number) || getDefaultPoints(config),
      );
      setNotes((existingResult.result_data.notes as string) || "");
    }
  }, [existingResult, config]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!validateExtraShots()) return;

    if (assignedPoints < 0) {
      toast.error("Os pontos têm de ser positivos.");
      return;
    }

    onSubmit({
      result_data: {
        assigned_points: assignedPoints,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penaltiesInPoints,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="general-points" className="mb-2 block text-sm font-medium text-foreground">
          Assigned Points
        </label>
        <input
          id="general-points"
          type="number"
          min={config.min_points || 0}
          max={config.max_points || 100}
          value={assignedPoints}
          onChange={(e) => setAssignedPoints(Number(e.target.value))}
          className="w-full rounded border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder={`Enter points (${config.min_points || 0}-${config.max_points || 100})`}
          required
        />
        <p className="mt-1 text-sm text-muted-foreground">
          Range: {config.min_points || 0} - {config.max_points || 100} points
        </p>
      </div>

      {showExtraShots && (
        <ExtraShotsField
          idPrefix="general"
          extraShots={extraShots}
          onChange={setExtraShots}
          maxExtraShots={maxExtraShots}
          maxExtraShotsPerMember={maxExtraShotsPerMember}
        />
      )}

      {showPenalties && (
        <PenaltiesFieldset
          idPrefix="general"
          penalties={penalties}
          onChange={setPenalties}
          penaltyValues={penaltyValues}
          penaltyCounters={penaltyCounters}
          showVomitPenalty={showVomitPenalty}
          showNotDrinkingPenalty={showNotDrinkingPenalty}
        />
      )}

      <NotesField idPrefix="general" notes={notes} onChange={setNotes} />

      <FormSubmitButton
        isSubmitting={isSubmitting}
        label={getSubmitLabel(isSubmitting, !!existingResult)}
      />
    </form>
  );
}
