import { useState, useEffect } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { getPenaltyValues, getExtraShotsConfig } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useAppToast } from "@/hooks/use-toast";
import type { BaseActivityFormProps } from "@/types/forms";
import { getTeamSize } from "@/types/forms";

export default function BooleanForm({
  existingResult,
  team,
  onSubmit,
  isSubmitting,
}: BaseActivityFormProps) {
  const [isSuccessChecked, setIsSuccessChecked] = useState(false);
  const [attempts, setAttempts] = useState<number>(1);
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
      setIsSuccessChecked((existingResult.result_data.success as boolean) || false);
      setAttempts((existingResult.result_data.attempts as number) || 1);
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

    onSubmit({
      result_data: {
        success: isSuccessChecked,
        attempts: attempts,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penalties,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="success-checkbox" className="mb-2 block text-sm font-medium text-foreground">Success</label>
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
          <label htmlFor="success-checkbox" className="cursor-pointer font-medium text-muted-foreground">
            Team succeeded in the activity
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="attempts-input" className="mb-2 block text-sm font-medium text-foreground">Attempts</label>
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

      <div>
        <label htmlFor="extra-shots-input" className="mb-2 block text-sm font-medium text-foreground">Extra Shots</label>
        <input
          id="extra-shots-input"
          type="number"
          min="0"
          max={maxExtraShots}
          value={extraShots}
          onChange={(e) => setExtraShots(Number.parseInt(e.target.value, 10) || 0)}
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
              id="vomit-input"
              type="number"
              min="0"
              value={penalties.vomit || 0}
              onChange={(e) =>
                setPenalties({ ...penalties, vomit: Number.parseInt(e.target.value, 10) || 0 })
              }
              className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <label htmlFor="vomit-input" className="text-sm text-muted-foreground">
              Vomit penalty ({penaltyValues.vomit} pts each)
            </label>
          </div>
          <div className="flex items-center space-x-3">
            <input
              id="not-drinking-input"
              type="number"
              min="0"
              value={penalties.not_drinking || 0}
              onChange={(e) =>
                setPenalties({ ...penalties, not_drinking: Number.parseInt(e.target.value, 10) || 0 })
              }
              className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <label htmlFor="not-drinking-input" className="text-sm text-muted-foreground">
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
        <label htmlFor="notes-input" className="mb-2 block text-sm font-medium text-foreground">Notes (Optional)</label>
        <textarea
          id="notes-input"
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
