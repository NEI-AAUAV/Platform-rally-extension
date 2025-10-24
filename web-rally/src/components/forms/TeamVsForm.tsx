import { useState, useEffect } from "react";

interface TeamVsFormProps {
  existingResult?: any;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

export default function TeamVsForm({ existingResult, onSubmit, isSubmitting }: TeamVsFormProps) {
  const [result, setResult] = useState<string>("win");
  const [opponentTeamId, setOpponentTeamId] = useState<number | undefined>();
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (existingResult?.result_data) {
      setResult(existingResult.result_data.result || "win");
      setOpponentTeamId(existingResult.result_data.opponent_team_id);
      setNotes(existingResult.result_data.notes || "");
    }
  }, [existingResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      result_data: {
        result: result,
        opponent_team_id: opponentTeamId,
        notes: notes,
      }
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
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? "Saving..." : existingResult ? "Update Evaluation" : "Submit Evaluation"}
        </button>
      </div>
    </form>
  );
}
