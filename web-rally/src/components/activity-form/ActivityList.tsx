import React, { useState } from "react";
import { BloodyButton } from "@/components/themes/bloody";

import { Edit, Trash2, GripVertical, Activity as LucideActivity } from "lucide-react";
import { Activity as ActivityType, Checkpoint } from "@/types/activityTypes";

interface ActivityListProps {
  activities: ActivityType[];
  checkpoints: Checkpoint[];
  onEdit: (activity: ActivityType) => void;
  onDelete: (id: number) => void;
  onReorder?: (activityOrders: Record<number, number>) => void;
}

const activityTypeLabels = {
  TimeBasedActivity: "Baseada em Tempo",
  ScoreBasedActivity: "Baseada em Pontuação",
  BooleanActivity: "Sim/Não",
  TeamVsActivity: "Equipa vs Equipa",
  GeneralActivity: "Geral",
  DeferredJudgedActivity: "Avaliação Posterior (Fotos)",
};

export default function ActivityList({
  activities,
  checkpoints,
  onEdit,
  onDelete,
  onReorder,
}: Readonly<ActivityListProps>) {
  const [draggedActivity, setDraggedActivity] = useState<ActivityType | null>(null);

  const getCheckpointName = (checkpointId: number) => {
    const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);
    return checkpoint ? checkpoint.name : `Checkpoint ${checkpointId}`;
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, activity: ActivityType) => {
    setDraggedActivity(activity);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
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
      .filter((a) => a.checkpoint_id === draggedActivity.checkpoint_id)
      .sort((a, b) => a.order - b.order);

    // Find indices
    const draggedIndex = checkpointActivities.findIndex((a) => a.id === draggedActivity.id);
    const targetIndex = checkpointActivities.findIndex((a) => a.id === targetActivity.id);

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
      <div className="py-8 text-center text-muted-foreground">
        <LucideActivity className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <p className="mb-2 text-lg font-medium">Nenhuma atividade criada</p>
        <p className="text-sm">Crie a primeira atividade para começar a configurar o Rally.</p>
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
            className={`rounded-lg border border-border bg-muted p-4 transition-all ${
              draggedActivity?.id === activity.id ? "scale-95 opacity-50" : "hover:bg-muted"
            } ${onReorder ? "cursor-move" : ""}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex flex-1 items-start gap-3">
                {onReorder && (
                  <div className="mt-1 flex flex-col items-center text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="text-lg font-semibold">{activity.name}</h4>
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        activity.is_active
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {activity.is_active ? "Ativa" : "Inativa"}
                    </span>
                  </div>

                  {activity.description && (
                    <p className="mb-2 text-muted-foreground">{activity.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      <strong>Tipo:</strong> {activityTypeLabels[activity.activity_type]}
                    </span>
                    <span>
                      <strong>Checkpoint:</strong> {getCheckpointName(activity.checkpoint_id)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ml-4 flex gap-2">
                <BloodyButton
                  variant="neutral"
                  aria-label={`Editar atividade ${activity.name}`}
                  onClick={() => onEdit(activity)}
                >
                  <Edit className="h-4 w-4" />
                </BloodyButton>
                <BloodyButton
                  variant="neutral"
                  aria-label={`Eliminar atividade ${activity.name}`}
                  onClick={() => onDelete(activity.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </BloodyButton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
