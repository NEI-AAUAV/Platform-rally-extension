import { useState, useEffect } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { RALLY_DEFAULTS, getPenaltyValues, getExtraShotsConfig } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { useAppToast } from "@/hooks/use-toast";

interface GeneralConfig {
  default_points?: number;
  [key: string]: any;
}

interface GeneralFormProps {
  existingResult?: any;
  team?: any;
  config: GeneralConfig;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

// Helper function to safely extract default_points from config
function getDefaultPoints(config: GeneralConfig): number {
  const defaultPoints = config.default_points;
  if (typeof defaultPoints === 'number') {
    return defaultPoints;
  }
  return RALLY_DEFAULTS.FORM_DEFAULTS.generalPoints;
}

export default function GeneralForm({ existingResult, team, config, onSubmit, isSubmitting }: GeneralFormProps) {
  const [assignedPoints, setAssignedPoints] = useState<number>(getDefaultPoints(config));
  const [extraShots, setExtraShots] = useState<number>(0);
  const [penalties, setPenalties] = useState<{[key: string]: number}>({});
  const [notes, setNotes] = useState<string>("");
  const toast = useAppToast();

  // Get Rally settings for dynamic penalty values
  const { settings } = useRallySettings();

  // Calculate max extra shots based on team size
  const teamSize = team?.num_members || team?.members?.length || 1;
  const extraShotsConfig = getExtraShotsConfig(settings);
  const maxExtraShotsPerMember = extraShotsConfig.perMember;
  const maxExtraShots = teamSize * maxExtraShotsPerMember;
  
  // Use penalty values from API settings or fallback to defaults
  const penaltyValues = getPenaltyValues(settings);

  useEffect(() => {
    if (existingResult?.result_data) {
      setAssignedPoints(existingResult.result_data.assigned_points || getDefaultPoints(config));
      setNotes(existingResult.result_data.notes || "");
    }
    if (existingResult) {
      setExtraShots(existingResult.extra_shots || 0);
      setPenalties(existingResult.penalties || {});
    }
  }, [existingResult, config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate extra shots limit
    if (extraShots > maxExtraShots) {
      toast.error(`Extra shots cannot exceed ${maxExtraShots} (${maxExtraShotsPerMember} per team member)`);
      return;
    }
    
    onSubmit({
      result_data: {
        assigned_points: assignedPoints,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penalties,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Assigned Points
        </label>
        <input
          type="number"
          min={config.min_points || 0}
          max={config.max_points || 100}
          value={assignedPoints}
          onChange={(e) => setAssignedPoints(Number(e.target.value))}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white placeholder-[rgb(255,255,255,0.5)] focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder={`Enter points (${config.min_points || 0}-${config.max_points || 100})`}
          required
        />
        <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
          Range: {config.min_points || 0} - {config.max_points || 100} points
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Extra Shots
        </label>
        <input
          type="number"
          min="0"
          max={maxExtraShots}
          value={extraShots}
          onChange={(e) => setExtraShots(parseInt(e.target.value, 10) || 0)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Extra shots taken"
        />
        <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
          Bonus shots taken (adds points to final score). Max: {maxExtraShots} shots ({maxExtraShotsPerMember} per team member)
        </p>
        {extraShots > maxExtraShots && (
          <p className="text-red-400 text-sm mt-1">
            ⚠️ Exceeds maximum allowed extra shots ({maxExtraShots})
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Penalties
        </label>
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <input
              type="number"
              min="0"
              value={penalties.vomit || 0}
              onChange={(e) => setPenalties({...penalties, vomit: parseInt(e.target.value, 10) || 0})}
              className="w-20 p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <span className="text-[rgb(255,255,255,0.8)] text-sm">
              Vomit penalty ({penaltyValues.vomit} pts each)
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <input
              type="number"
              min="0"
              value={penalties.not_drinking || 0}
              onChange={(e) => setPenalties({...penalties, not_drinking: parseInt(e.target.value, 10) || 0})}
              className="w-20 p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <span className="text-[rgb(255,255,255,0.8)] text-sm">
              Not drinking penalty ({penaltyValues.not_drinking} pts each)
            </span>
          </div>
        </div>
        <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
          Penalties reduce the final score. Total penalty: {((penalties.vomit || 0) * penaltyValues.vomit + (penalties.not_drinking || 0) * penaltyValues.not_drinking)} points
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white placeholder-[rgb(255,255,255,0.5)] focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Add any additional notes..."
          rows={3}
        />
      </div>

      <div className="flex gap-3 mt-6">
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
