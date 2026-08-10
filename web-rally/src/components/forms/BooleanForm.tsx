import { useState, useEffect, type FormEvent } from "react";
import { useExtraShotsAndPenalties, getSubmitLabel } from "@/hooks/useExtraShotsAndPenalties";
import ExtraShotsField from "@/components/forms/shared/ExtraShotsField";
import PenaltiesFieldset from "@/components/forms/shared/PenaltiesFieldset";
import NotesField from "@/components/forms/shared/NotesField";
import FormSubmitButton from "@/components/forms/shared/FormSubmitButton";
import type { BaseActivityFormProps } from "@/types/forms";

export default function BooleanForm({
  existingResult,
  team,
  onSubmit,
  isSubmitting,
  penaltyCounters = [],
}: BaseActivityFormProps) {
  const [isSuccessChecked, setIsSuccessChecked] = useState(false);
  const [attempts, setAttempts] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  const {
    extraShots,
    setExtraShots,
    penalties,
    penaltiesInPoints,
    setPenalties,
    maxExtraShots,
    maxExtraShotsPerMember,
    penaltyValues,
    showVomitPenalty,
    showNotDrinkingPenalty,
    validateExtraShots,
  } = useExtraShotsAndPenalties(team, existingResult, penaltyCounters);

  useEffect(() => {
    if (existingResult?.result_data) {
      setIsSuccessChecked((existingResult.result_data.success as boolean) || false);
      setAttempts((existingResult.result_data.attempts as number) || 1);
      setNotes((existingResult.result_data.notes as string) || "");
    }
  }, [existingResult]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!validateExtraShots()) return;

    onSubmit({
      result_data: {
        success: isSuccessChecked,
        attempts: attempts,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penaltiesInPoints,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="success-checkbox"
          className="mb-2 block text-sm font-medium text-foreground"
        >
          Success
        </label>
        <div className="flex items-center space-x-3">
          <input
            id="success-checkbox"
            type="checkbox"
            checked={isSuccessChecked}
            onChange={(e) => setIsSuccessChecked(e.target.checked)}
            className="peer sr-only"
          />
          <label
            htmlFor="success-checkbox"
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-2 transition-all duration-200 hover:border-red-500 hover:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-red-500 peer-focus-visible:ring-offset-2 ${
              isSuccessChecked ? "border-red-500 bg-muted" : "border-border bg-muted"
            }`}
          >
            <span className="sr-only">Success</span>
            <svg
              className={`h-4 w-4 text-red-500 transition-opacity duration-200 ${
                isSuccessChecked ? "opacity-100" : "opacity-0"
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </label>
          <label
            htmlFor="success-checkbox"
            className="cursor-pointer font-medium text-muted-foreground"
          >
            Team succeeded in the activity
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="attempts-input" className="mb-2 block text-sm font-medium text-foreground">
          Attempts
        </label>
        <input
          id="attempts-input"
          type="number"
          min="1"
          value={attempts}
          onChange={(e) => setAttempts(Number.parseInt(e.target.value, 10) || 1)}
          className="w-full rounded border border-border bg-muted p-3 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Number of attempts"
        />
        <p className="mt-1 text-sm text-muted-foreground">How many attempts did the team make?</p>
      </div>

      <ExtraShotsField
        idPrefix="extra-shots-input"
        extraShots={extraShots}
        onChange={setExtraShots}
        maxExtraShots={maxExtraShots}
        maxExtraShotsPerMember={maxExtraShotsPerMember}
      />

      <PenaltiesFieldset
        idPrefix="boolean"
        penalties={penalties}
        onChange={setPenalties}
        penaltyValues={penaltyValues}
        penaltyCounters={penaltyCounters}
        showVomitPenalty={showVomitPenalty}
        showNotDrinkingPenalty={showNotDrinkingPenalty}
      />

      <NotesField idPrefix="notes" notes={notes} onChange={setNotes} />

      <FormSubmitButton
        isSubmitting={isSubmitting}
        label={getSubmitLabel(isSubmitting, !!existingResult)}
      />
    </form>
  );
}
