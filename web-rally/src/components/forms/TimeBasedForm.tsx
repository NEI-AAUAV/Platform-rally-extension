import { useState, useEffect } from "react";
import { Timer } from "lucide-react";
import { BloodyButton } from "@/components/themes/bloody";
import { StopwatchWidget } from "@/components/shared";
import { getPenaltyValues, getExtraShotsConfig } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useAppToast } from "@/hooks/use-toast";
import type { BaseActivityFormProps } from "@/types/forms";
import { getTeamSize } from "@/types/forms";

export default function TimeBasedForm({
  existingResult,
  team,
  onSubmit,
  isSubmitting,
}: BaseActivityFormProps) {
  // Keep as string to allow clearing input and typing like ".5" or "03"
  const [completionTime, setCompletionTime] = useState<string>("");
  const [showStopwatch, setShowStopwatch] = useState<boolean>(false);
  const [extraShots, setExtraShots] = useState<number>(0);
  const [penalties, setPenalties] = useState<{ [key: string]: number }>({});
  const [notes, setNotes] = useState<string>("");
  const toast = useAppToast();

  // Get Rally settings for dynamic configuration
  const { settings } = useRallySettings();

  // Calculate max extra shots based on team size
  const teamSize = getTeamSize(team);
  const extraShotsConfig = getExtraShotsConfig(settings);
  const maxExtraShotsPerMember = extraShotsConfig.perMember;
  const maxExtraShots = teamSize * maxExtraShotsPerMember;

  // Use penalty values from API settings or fallback to defaults
  const penaltyValues = getPenaltyValues(settings);

  useEffect(() => {
    if (existingResult?.result_data) {
      const v = existingResult.result_data.completion_time_seconds;
      setCompletionTime(
        typeof v === "number" && !isNaN(v) ? String(v) : typeof v === "string" ? v : "",
      );
      setNotes((existingResult.result_data.notes as string) || "");
    }
    if (existingResult) {
      setExtraShots(existingResult.extra_shots || 0);
      setPenalties(existingResult.penalties || {});
    }
  }, [existingResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate extra shots limit
    if (extraShots > maxExtraShots) {
      toast.error(
        `Extra shots cannot exceed ${maxExtraShots} (${maxExtraShotsPerMember} per team member)`,
      );
      return;
    }

    // Normalize and validate time (allow comma or dot)
    const normalized = (completionTime || "").replace(",", ".").trim();
    const parsed = normalized === "" ? NaN : parseFloat(normalized);
    if (isNaN(parsed) || parsed < 0) {
      toast.error("Please enter a valid non-negative time in seconds.");
      return;
    }

    onSubmit({
      result_data: {
        completion_time_seconds: parsed,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penalties,
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
          pattern="[0-9]*[.,]?[0-9]*"
          value={completionTime}
          onChange={(e) => setCompletionTime(e.target.value)}
          className="w-full rounded border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Enter completion time in seconds"
        />
      </div>

      <div>
        <label
          htmlFor="timebased-extra-shots"
          className="mb-2 block text-sm font-medium text-foreground"
        >
          Extra Shots
        </label>
        <input
          id="timebased-extra-shots"
          type="number"
          min="0"
          max={maxExtraShots}
          value={extraShots}
          onChange={(e) => setExtraShots(parseInt(e.target.value, 10) || 0)}
          className="w-full rounded border border-border bg-muted p-3 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Extra shots taken"
        />
        <p className="mt-1 text-sm text-muted-foreground">
          Bonus shots taken (adds points to final score). Max: {maxExtraShots} shots (
          {maxExtraShotsPerMember} per team member)
        </p>
        {extraShots > maxExtraShots && (
          <p className="mt-1 text-sm text-red-400">
            ⚠️ Exceeds maximum allowed extra shots ({maxExtraShots})
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-foreground">Penalties</legend>
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <input
              id="timebased-vomit"
              type="number"
              min="0"
              value={penalties.vomit || 0}
              onChange={(e) =>
                setPenalties({ ...penalties, vomit: parseInt(e.target.value, 10) || 0 })
              }
              className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <label htmlFor="timebased-vomit" className="text-sm text-muted-foreground">
              Vomit penalty ({penaltyValues.vomit} pts each)
            </label>
          </div>
          <div className="flex items-center space-x-3">
            <input
              id="timebased-not-drinking"
              type="number"
              min="0"
              value={penalties.not_drinking || 0}
              onChange={(e) =>
                setPenalties({ ...penalties, not_drinking: parseInt(e.target.value, 10) || 0 })
              }
              className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <label htmlFor="timebased-not-drinking" className="text-sm text-muted-foreground">
              Not drinking penalty ({penaltyValues.not_drinking} pts each)
            </label>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Penalties reduce the final score. Total penalty:{" "}
          {(penalties.vomit || 0) * penaltyValues.vomit +
            (penalties.not_drinking || 0) * penaltyValues.not_drinking}{" "}
          points
        </p>
      </fieldset>

      <div>
        <label htmlFor="timebased-notes" className="mb-2 block text-sm font-medium text-foreground">
          Notes (Optional)
        </label>
        <textarea
          id="timebased-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Add any additional notes..."
          rows={3}
        />
      </div>

      <div className="mt-6 flex gap-3">
        <BloodyButton
          type="submit"
          disabled={isSubmitting}
          variant="primary"
          blood={true}
          className="flex-1 px-6 py-3"
        >
          {isSubmitting ? "Saving..." : existingResult ? "Update Evaluation" : "Submit Evaluation"}
        </BloodyButton>
      </div>
    </form>
  );
}
