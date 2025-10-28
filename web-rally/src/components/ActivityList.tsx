import { useState } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import {  } from "@/components/ui/alert";
import { Edit, Trash2, Activity as ActivityIcon, GripVertical } from "lucide-react";
import { Activity as ActivityType, Checkpoint } from "@/types/activityTypes";

interface ActivityListProps {
  activities: ActivityType[];
  checkpoints: Checkpoint[];
  onEdit: (activity: ActivityType) => void;
  onDelete: (id: number) => void;
  onReorder?: (activityOrders: Record<number, number>) => void;
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
  onReorder,
  isDeleting = false,
}: ActivityListProps) {
  const [draggedActivity, setDraggedActivity] = useState<ActivityType | null>(null);

  const getCheckpointName = (checkpointId: number) => {
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
    return checkpoint ? checkpoint.name : `Checkpoint ${checkpointId}`;
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, activity: ActivityType) => {
    setDraggedActivity(activity);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetActivity: ActivityType) => {
    e.preventDefault();
    
    if (!draggedActivity || draggedActivity.id === targetActivity.id || !onReorder) {
      setDraggedActivity(null);
      return;
    }

    // Only allow reordering within the same checkpoint
    if (draggedActivity.checkpoint_id !== targetActivity.checkpoint_id) {
      setDraggedActivity(null);
      return;
    }

    // Create new order mapping
    const activityOrders: Record<number, number> = {};
    
    // Sort activities by current order within the same checkpoint
    const checkpointActivities = activities
      .filter(a => a.checkpoint_id === draggedActivity.checkpoint_id)
      .sort((a, b) => a.order - b.order);
    
    // Find indices
    const draggedIndex = checkpointActivities.findIndex(a => a.id === draggedActivity.id);
    const targetIndex = checkpointActivities.findIndex(a => a.id === targetActivity.id);
    
    // Validate indices before manipulating array
    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }
    
    // Reorder array
    const reorderedActivities = [...checkpointActivities];
    const [draggedItem] = reorderedActivities.splice(draggedIndex, 1);
    if (draggedItem) {
      reorderedActivities.splice(targetIndex, 0, draggedItem);
    }
    
    // Create order mapping
    reorderedActivities.forEach((activity, index) => {
      activityOrders[activity.id] = index + 1;
    });
    
    // Send reorder request
    onReorder(activityOrders);
    setDraggedActivity(null);
  };

  const handleDragEnd = () => {
    setDraggedActivity(null);
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
            draggable={!!onReorder}
            onDragStart={(e) => handleDragStart(e, activity)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, activity)}
            onDragEnd={handleDragEnd}
            className={`bg-[rgb(255,255,255,0.1)] rounded-lg p-4 border border-[rgb(255,255,255,0.2)] transition-all ${
              draggedActivity?.id === activity.id ? 'opacity-50 scale-95' : 'hover:bg-[rgb(255,255,255,0.15)]'
            } ${onReorder ? 'cursor-move' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                {onReorder && (
                  <div className="flex flex-col items-center text-[rgb(255,255,255,0.5)] mt-1">
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}
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
                  </div>
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
