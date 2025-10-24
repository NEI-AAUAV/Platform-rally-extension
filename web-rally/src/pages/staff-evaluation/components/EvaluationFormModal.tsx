import { BloodyButton } from "@/components/themes/bloody";
import { ActivityForm } from "@/components/forms";

interface EvaluationFormModalProps {
  isOpen: boolean;
  activity: any;
  team: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function EvaluationFormModal({
  isOpen,
  activity,
  team,
  onSubmit,
  onCancel,
  isSubmitting
}: EvaluationFormModalProps) {
  if (!isOpen || !activity || !team) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4"
      style={{ 
        zIndex: 9999, 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)'
      }}
    >
      <div className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] backdrop-blur-md text-white p-6 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Evaluate: {activity.name}</h2>
          <button 
            onClick={onCancel}
            className="text-[rgb(255,255,255,0.6)] hover:text-white text-2xl transition-colors"
          >
            ×
          </button>
        </div>
        
        <ActivityForm
          activity={activity}
          team={team}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
        />

        <div className="flex gap-3 mt-6">
          <BloodyButton 
            type="button"
            variant="neutral"
            onClick={onCancel}
          >
            Cancel
          </BloodyButton>
        </div>
      </div>
    </div>
  );
}


