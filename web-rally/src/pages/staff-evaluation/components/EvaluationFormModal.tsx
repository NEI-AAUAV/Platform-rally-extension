import { Button } from "@/components/ui/button";
import { ActivityEvaluationForm } from "@/components/forms";
import type { ActivityResponse } from "@/client";
import type { Team, ActivityResultData } from "@/types/forms";

type EvaluationFormModalProps = Readonly<{

  isOpen: boolean;
  activity: ActivityResponse;
  team: Team;
  onSubmit: (data: ActivityResultData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}>

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
      <div className="rally-surface rally-elevate rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="rally-display text-2xl font-bold text-foreground">Avaliar: {activity.name}</h2>
          <button 
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground text-2xl transition-colors"
          >
            ×
          </button>
        </div>
        
        <ActivityEvaluationForm
          activity={{
            ...activity,
            evaluation_status: "pending" as const,
          }}
          team={team}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          onCaptured={onCancel}
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
      </div>
    </div>
  );
}




