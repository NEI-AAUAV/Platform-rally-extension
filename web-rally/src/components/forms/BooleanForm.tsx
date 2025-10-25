import { useState, useEffect } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { RALLY_DEFAULTS, getPenaltyValues, getExtraShotsConfig } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";

interface BooleanFormProps {
  existingResult?: any;
  team?: any;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

export default function BooleanForm({ existingResult, team, onSubmit, isSubmitting }: BooleanFormProps) {
  const [isSuccessChecked, setIsSuccessChecked] = useState(false);
  const [attempts, setAttempts] = useState<number>(1);
  const [extraShots, setExtraShots] = useState<number>(0);
  const [penalties, setPenalties] = useState<{[key: string]: number}>({});
  const [notes, setNotes] = useState<string>("");

  // Get Rally settings for dynamic configuration
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
      setIsSuccessChecked(existingResult.result_data.success || false);
      setAttempts(existingResult.result_data.attempts || 1);
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
      alert(`Extra shots cannot exceed ${maxExtraShots} (${maxExtraShotsPerMember} per team member)`);
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
        <label className="block text-sm font-medium mb-2 text-white">
          Success
        </label>
        <div className="flex items-center space-x-3">
          <div 
            className={`flex items-center justify-center w-6 h-6 border-2 rounded cursor-pointer transition-all duration-200 hover:border-red-500 hover:bg-[rgb(255,255,255,0.15)] ${
              isSuccessChecked 
                ? 'bg-[rgb(255,255,255,0.2)] border-red-500' 
                : 'bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.3)]'
            }`}
            onClick={() => setIsSuccessChecked(!isSuccessChecked)}
          >
            <svg 
              className={`w-4 h-4 text-red-500 transition-opacity duration-200 ${
                isSuccessChecked ? 'opacity-100' : 'opacity-0'
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
          </div>
          <span className="text-[rgb(255,255,255,0.8)] font-medium">Team succeeded in the activity</span>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Attempts
        </label>
        <input
          type="number"
          min="1"
          value={attempts}
          onChange={(e) => setAttempts(parseInt(e.target.value) || 1)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Number of attempts"
        />
        <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
          How many attempts did the team make?
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
          onChange={(e) => setExtraShots(parseInt(e.target.value) || 0)}
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
              onChange={(e) => setPenalties({...penalties, vomit: parseInt(e.target.value) || 0})}
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
              onChange={(e) => setPenalties({...penalties, not_drinking: parseInt(e.target.value) || 0})}
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
