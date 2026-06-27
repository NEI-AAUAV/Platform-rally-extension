import React from "react";
import { Edit, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { BloodyButton } from "@/components/themes/bloody";
import type { Checkpoint } from "./useCheckpointManagement";

type CheckpointListItemProps = Readonly<{
  checkpoint: Checkpoint;
  isDragging: boolean;
  isDeleting: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, checkpoint: Checkpoint) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, checkpoint: Checkpoint) => void;
  onDragEnd: () => void;
  onEdit: (checkpoint: Checkpoint) => void;
  onDelete: (id: number) => void;
}>;

export default function CheckpointListItem({
  checkpoint,
  isDragging,
  isDeleting,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEdit,
  onDelete,
}: CheckpointListItemProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, checkpoint)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, checkpoint)}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
        }
      }}
      aria-label={`Checkpoint ${checkpoint.name}, ordem ${checkpoint.order}`}
    >
      <div
        className={cn(
          "border border-border bg-card/60 rounded-xl p-4 sm:p-6 flex items-center justify-between cursor-move transition-all hover:bg-accent",
          isDragging && "opacity-50 scale-95",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center text-muted-foreground">
            <GripVertical className="w-4 h-4" />
            <span className="text-xs font-mono">{checkpoint.order}</span>
          </div>
          <div>
            <div className="font-semibold">{checkpoint.name}</div>
            <div className="text-sm text-muted-foreground">{checkpoint.description}</div>
            {(checkpoint.latitude || checkpoint.longitude) && (
              <div className="text-xs text-muted-foreground">
                📍 {checkpoint.latitude}, {checkpoint.longitude}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <BloodyButton variant="neutral" onClick={() => onEdit(checkpoint)}>
            <Edit className="w-4 h-4" />
          </BloodyButton>
          <BloodyButton variant="neutral" onClick={() => onDelete(checkpoint.id)} disabled={isDeleting}>
            <Trash2 className="w-4 h-4" />
          </BloodyButton>
        </div>
      </div>
    </div>
  );
}
