import { useState, useEffect, type FormEvent } from "react";
import { Timer } from "lucide-react";
import { StopwatchWidget } from "@/components/shared";
import { useExtraShotsAndPenalties, getSubmitLabel } from "@/hooks/useExtraShotsAndPenalties";
import { useAppToast } from "@/hooks/use-toast";
import ExtraShotsField from "@/components/forms/shared/ExtraShotsField";
import PenaltiesFieldset from "@/components/forms/shared/PenaltiesFieldset";
import NotesField from "@/components/forms/shared/NotesField";
import FormSubmitButton from "@/components/forms/shared/FormSubmitButton";
import type { BaseActivityFormProps } from "@/types/forms";

export default function TimeBasedForm({
  existingResult,
  team,
  onSubmit,
  isSubmitting,
  penaltyCounters = [],
}: BaseActivityFormProps) {
  // Keep as string to allow clearing input and typing like ".5" or "03"
  const [completionTime, setCompletionTime] = useState<string>("");
  const [showStopwatch, setShowStopwatch] = useState<boolean>(false);
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
    penaltyValues,
    showVomitPenalty,
    showNotDrinkingPenalty,
    globalPenaltyCounters,
    validateExtraShots,
  } = useExtraShotsAndPenalties(team, existingResult, penaltyCounters);

  useEffect(() => {
    if (existingResult?.result_data) {
      const v = existingResult.result_data.completion_time_seconds;
      let timeValue = "";
      if (typeof v === "number" && !Number.isNaN(v)) {
        timeValue = String(v);
      } else if (typeof v === "string") {
        timeValue = v;
      }
      setCompletionTime(timeValue);
      setNotes((existingResult.result_data.notes as string) || "");
    }
  }, [existingResult]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!validateExtraShots()) return;

    // Normalize and validate time (allow comma or dot)
    const normalized = (completionTime || "").replace(",", ".").trim();
    const parsed = normalized === "" ? NaN : parseFloat(normalized);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Introduz um tempo válido e não negativo, em segundos.");
      return;
    }

    onSubmit({
      result_data: {
        completion_time_seconds: parsed,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penaltiesInPoints,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="timebased-completion-time"
            className="block text-sm font-medium text-foreground"
          >
            Completion Time (seconds)
          </label>
          <button
            type="button"
            onClick={() => setShowStopwatch((v) => !v)}
            className="rally-press inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-accent"
          >
            <Timer className="h-3.5 w-3.5" />
            {showStopwatch ? "Ocultar cronómetro" : "Usar cronómetro"}
          </button>
        </div>

        {showStopwatch && (
          <div className="mb-3">
            <StopwatchWidget onUseTime={(seconds) => setCompletionTime(String(seconds))} />
          </div>
        )}

        <input
          id="timebased-completion-time"
          type="text"
          inputMode="decimal"
          value={completionTime}
          onChange={(e) => setCompletionTime(e.target.value)}
          className="w-full rounded border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Introduz o tempo de conclusão em segundos"
        />
      </div>

      <ExtraShotsField
        idPrefix="timebased"
        extraShots={extraShots}
        onChange={setExtraShots}
        maxExtraShots={maxExtraShots}
        maxExtraShotsPerMember={maxExtraShotsPerMember}
      />

      <PenaltiesFieldset
        idPrefix="timebased"
        penalties={penalties}
        onChange={setPenalties}
        penaltyValues={penaltyValues}
        penaltyCounters={penaltyCounters}
        globalPenaltyCounters={globalPenaltyCounters}
        showVomitPenalty={showVomitPenalty}
        showNotDrinkingPenalty={showNotDrinkingPenalty}
      />

      <NotesField idPrefix="timebased" notes={notes} onChange={setNotes} />

      <FormSubmitButton
        isSubmitting={isSubmitting}
        label={getSubmitLabel(isSubmitting, !!existingResult)}
      />
    </form>
  );
}
