import { useState, useEffect } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { getPenaltyValues, getExtraShotsConfig } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useAppToast } from "@/hooks/use-toast";
import type { BaseActivityFormProps } from "@/types/forms";
import { getTeamSize } from "@/types/forms";

function getSubmitLabel(isSubmitting: boolean, hasExisting: boolean): string {
  if (isSubmitting) return "Saving...";
  return hasExisting ? "Update Evaluation" : "Submit Evaluation";
}

export default function ScoreBasedForm({
  existingResult,
  team,
  onSubmit,
  isSubmitting,
}: Readonly<BaseActivityFormProps>) {
  const [achievedPoints, setAchievedPoints] = useState<number>(0);
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

  const showExtraShots = maxExtraShots > 0;
  const showVomitPenalty = penaltyValues.vomit > 0;
  const showNotDrinkingPenalty = penaltyValues.not_drinking > 0;
  const showPenalties = showVomitPenalty || showNotDrinkingPenalty;

  useEffect(() => {
    if (existingResult?.result_data) {
      setAchievedPoints(existingResult.result_data.achieved_points || 0);
      setNotes(existingResult.result_data.notes || "");
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

    // Validate non-negative points
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
        <div>
          <label
            htmlFor="score-extra-shots"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Extra Shots
          </label>
          <input
            id="score-extra-shots"
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
      )}

      {showPenalties && (
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-foreground">Penalties</legend>
          <div className="space-y-2">
            {showVomitPenalty && (
              <div className="flex items-center space-x-3">
                <input
                  id="score-vomit"
                  type="number"
                  min="0"
                  value={penalties.vomit || 0}
                  onChange={(e) =>
                    setPenalties({ ...penalties, vomit: Number.parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="0"
                  aria-label="Vomit penalty count"
                />
                <label htmlFor="score-vomit" className="text-sm text-muted-foreground">
                  Vomit penalty ({penaltyValues.vomit} pts each)
                </label>
              </div>
            )}
            {showNotDrinkingPenalty && (
              <div className="flex items-center space-x-3">
                <input
                  id="score-not-drinking"
                  type="number"
                  min="0"
                  value={penalties.not_drinking || 0}
                  onChange={(e) =>
                    setPenalties({
                      ...penalties,
                      not_drinking: Number.parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="0"
                  aria-label="Not drinking penalty count"
                />
                <label htmlFor="score-not-drinking" className="text-sm text-muted-foreground">
                  Not drinking penalty ({penaltyValues.not_drinking} pts each)
                </label>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Penalties reduce the final score. Total penalty:{" "}
            {(penalties.vomit || 0) * penaltyValues.vomit +
              (penalties.not_drinking || 0) * penaltyValues.not_drinking}{" "}
            points
          </p>
        </fieldset>
      )}

      <div>
        <label htmlFor="score-notes" className="mb-2 block text-sm font-medium text-foreground">
          Notes (Optional)
        </label>
        <textarea
          id="score-notes"
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
          {getSubmitLabel(isSubmitting, !!existingResult)}
        </BloodyButton>
      </div>
    </form>
  );
}
