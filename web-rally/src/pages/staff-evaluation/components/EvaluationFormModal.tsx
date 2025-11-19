import { Button } from "@/components/ui/button";
import { ActivityForm } from "@/components/forms";
import { useThemedComponents } from "@/components/themes";
import type { ActivityResponse } from "@/client";
import type { Team, ActivityResultData } from "@/types/forms";

interface EvaluationFormModalProps {
  isOpen: boolean;
  activity: ActivityResponse;
  team: Team;
  onSubmit: (data: ActivityResultData) => void;
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
  const { Card } = useThemedComponents();
  
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
      <Card variant="elevated" padding="lg" rounded="lg" className="shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
          <Button 
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}




