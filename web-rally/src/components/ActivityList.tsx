import { useState } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Edit, Trash2, Activity as ActivityIcon, AlertCircle } from "lucide-react";
import { Activity as ActivityType, Checkpoint } from "@/types/activityTypes";

interface ActivityListProps {
  activities: ActivityType[];
  checkpoints: Checkpoint[];
  onEdit: (activity: ActivityType) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

const activityTypeLabels = {
  TimeBasedActivity: "Baseada em Tempo",
  ScoreBasedActivity: "Baseada em Pontuação",
  BooleanActivity: "Sim/Não", 
  TeamVsActivity: "Equipa vs Equipa",
  GeneralActivity: "Geral",
};

export default function ActivityList({
  activities,
  checkpoints,
  onEdit,
  onDelete,
  isDeleting = false,
}: ActivityListProps) {
  const getCheckpointName = (checkpointId: number) => {
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
    return checkpoint ? checkpoint.name : `Checkpoint ${checkpointId}`;
  };

  // Ensure activities is always an array
  const safeActivities = Array.isArray(activities) ? activities : [];

  if (safeActivities.length === 0) {
    return (
      <div className="text-center text-[rgb(255,255,255,0.7)] py-8">
        <ActivityIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">Nenhuma atividade criada</p>
        <p className="text-sm">
          Crie a primeira atividade para começar a configurar o Rally.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {safeActivities.map((activity) => (
          <div
            key={activity.id}
            className="bg-[rgb(255,255,255,0.1)] rounded-lg p-4 border border-[rgb(255,255,255,0.2)]"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-lg">{activity.name}</h4>
                  <span className={`px-2 py-1 rounded text-xs ${
                    activity.is_active 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {activity.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                
                {activity.description && (
                  <p className="text-[rgb(255,255,255,0.7)] mb-2">
                    {activity.description}
                  </p>
                )}
                
                <div className="flex items-center gap-4 text-sm text-[rgb(255,255,255,0.6)]">
                  <span>
                    <strong>Tipo:</strong> {activityTypeLabels[activity.activity_type]}
                  </span>
                  <span>
                    <strong>Checkpoint:</strong> {getCheckpointName(activity.checkpoint_id)}
                  </span>
                  {activity.order > 0 && (
                    <span>
                      <strong>Ordem:</strong> {activity.order}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 ml-4">
                <BloodyButton
                  variant="neutral"
                  onClick={() => onEdit(activity)}
                  disabled={isDeleting}
                >
                  <Edit className="w-4 h-4" />
                </BloodyButton>
                <BloodyButton
                  variant="neutral"
                  onClick={() => onDelete(activity.id)}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                </BloodyButton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
