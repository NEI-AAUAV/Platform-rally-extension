import { useState, useEffect, type FormEvent } from "react";
import { useExtraShotsAndPenalties, getSubmitLabel } from "@/hooks/useExtraShotsAndPenalties";
import { useAppToast } from "@/hooks/use-toast";
import ExtraShotsField from "@/components/forms/shared/ExtraShotsField";
import PenaltiesFieldset from "@/components/forms/shared/PenaltiesFieldset";
import NotesField from "@/components/forms/shared/NotesField";
import FormSubmitButton from "@/components/forms/shared/FormSubmitButton";
import type { BaseActivityFormProps } from "@/types/forms";

export default function ScoreBasedForm({
  existingResult,
  team,
  onSubmit,
  isSubmitting,
}: Readonly<BaseActivityFormProps>) {
  const [achievedPoints, setAchievedPoints] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const toast = useAppToast();

  const {
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
  } = useExtraShotsAndPenalties(team, existingResult);

  useEffect(() => {
    if (existingResult?.result_data) {
      setAchievedPoints((existingResult.result_data.achieved_points as number) || 0);
      setNotes((existingResult.result_data.notes as string) || "");
    }
  }, [existingResult]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!validateExtraShots()) return;

    if (achievedPoints < 0) {
      toast.error("Points must be positive.");
      return;
    }

    onSubmit({
      result_data: {
        achieved_points: achievedPoints,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penalties,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="score-achieved" className="mb-2 block text-sm font-medium text-foreground">
          Achieved Points
        </label>
        <input
          id="score-achieved"
          type="number"
          min="0"
          value={achievedPoints}
          onChange={(e) => setAchievedPoints(Number(e.target.value))}
          className="w-full rounded border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Enter achieved points"
          required
        />
      </div>

      {showExtraShots && (
        <ExtraShotsField
          idPrefix="score"
          extraShots={extraShots}
          onChange={setExtraShots}
          maxExtraShots={maxExtraShots}
          maxExtraShotsPerMember={maxExtraShotsPerMember}
        />
      )}

      {showPenalties && (
        <PenaltiesFieldset
          idPrefix="score"
          penalties={penalties}
          onChange={setPenalties}
          penaltyValues={penaltyValues}
          showVomitPenalty={showVomitPenalty}
          showNotDrinkingPenalty={showNotDrinkingPenalty}
        />
      )}

      <NotesField idPrefix="score" notes={notes} onChange={setNotes} />

      <FormSubmitButton
        isSubmitting={isSubmitting}
        label={getSubmitLabel(isSubmitting, !!existingResult)}
      />
    </form>
  );
}
