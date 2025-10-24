import { useState, useEffect } from "react";

interface TimeBasedFormProps {
  existingResult?: any;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

export default function TimeBasedForm({ existingResult, onSubmit, isSubmitting }: TimeBasedFormProps) {
  const [completionTime, setCompletionTime] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (existingResult?.result_data) {
      setCompletionTime(existingResult.result_data.completion_time_seconds || 0);
      setNotes(existingResult.result_data.notes || "");
    }
  }, [existingResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      result_data: {
        completion_time_seconds: completionTime,
        notes: notes,
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Completion Time (seconds)
        </label>
        <input
          type="number"
          step="0.1"
          min="0"
          value={completionTime}
          onChange={(e) => setCompletionTime(Number(e.target.value))}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white placeholder-[rgb(255,255,255,0.5)] focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Enter completion time in seconds"
          required
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
