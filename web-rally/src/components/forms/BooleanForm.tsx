import { useState, useEffect } from "react";

interface BooleanFormProps {
  existingResult?: any;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

export default function BooleanForm({ existingResult, onSubmit, isSubmitting }: BooleanFormProps) {
  const [isSuccessChecked, setIsSuccessChecked] = useState(false);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (existingResult?.result_data) {
      setIsSuccessChecked(existingResult.result_data.success || false);
      setNotes(existingResult.result_data.notes || "");
    }
  }, [existingResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      result_data: {
        success: isSuccessChecked,
        notes: notes,
      }
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
