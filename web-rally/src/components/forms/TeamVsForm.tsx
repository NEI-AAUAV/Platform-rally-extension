import { useState, useEffect } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { getPenaltyValues, getExtraShotsConfig } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";

interface TeamVsFormProps {
  existingResult?: any;
  team?: any;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

export default function TeamVsForm({ existingResult, team, onSubmit, isSubmitting }: TeamVsFormProps) {
  const [result, setResult] = useState<string>("win");
  const [opponentTeamId, setOpponentTeamId] = useState<number | undefined>();
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
      setResult(existingResult.result_data.result || "win");
      setOpponentTeamId(existingResult.result_data.opponent_team_id);
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
        result: result,
        opponent_team_id: opponentTeamId,
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
          Match Result
        </label>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
        >
          <option value="win" className="bg-gray-800">Win</option>
          <option value="lose" className="bg-gray-800">Lose</option>
          <option value="draw" className="bg-gray-800">Draw</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Opponent Team ID (Optional)
        </label>
        <input
          type="number"
          value={opponentTeamId || ""}
          onChange={(e) => setOpponentTeamId(e.target.value ? Number(e.target.value) : undefined)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white placeholder-[rgb(255,255,255,0.5)] focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Enter opponent team ID"
        />
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
