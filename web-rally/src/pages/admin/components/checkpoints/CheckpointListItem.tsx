import React, { useState } from "react";
import { Edit, Trash2, GripVertical, Images, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BloodyButton } from "@/components/themes/bloody";
import type { Checkpoint } from "./useCheckpointManagement";
import CheckpointMediaManager from "./CheckpointMediaManager";
import CheckpointGuideIndicationsManager from "./CheckpointGuideIndicationsManager";
import { missingLabel } from "./routeReadiness";

type CheckpointListItemProps = Readonly<{
  checkpoint: Checkpoint;
  isDragging: boolean;
  isDeleting: boolean;
  onDragStart: (e: React.DragEvent<HTMLElement>, checkpoint: Checkpoint) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>, checkpoint: Checkpoint) => void;
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
  const [showMedia, setShowMedia] = useState(false);

  return (
    <li
      draggable={!showMedia}
      onDragStart={(e) => onDragStart(e, checkpoint)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, checkpoint)}
      onDragEnd={onDragEnd}
      aria-label={`Checkpoint ${checkpoint.name}, ordem ${checkpoint.order}`}
    >
      <div
        className={cn(
          "rounded-xl border border-border bg-card/60 p-4 transition-all hover:bg-accent sm:p-6",
          !showMedia && "cursor-move",
          isDragging && "scale-95 opacity-50",
          showMedia && "rounded-b-none",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center text-muted-foreground">
              <GripVertical className="h-4 w-4" />
              <span className="font-mono text-xs">{checkpoint.order}</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{checkpoint.name}</span>
                {checkpoint.is_draft && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Rascunho — invisível para as equipas
                  </span>
                )}
                {checkpoint.is_placeholder && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    Nome provisório
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">{checkpoint.description}</div>
              {(checkpoint.latitude || checkpoint.longitude) && (
                <div className="text-xs text-muted-foreground">
                  📍 {checkpoint.latitude}, {checkpoint.longitude}
                  {checkpoint.arrival_radius_m ? ` · raio ${checkpoint.arrival_radius_m}m` : ""}
                </div>
              )}
              {/* Setting up a route means checking a dozen posts have a riddle;
                  say so here instead of opening each form to find out. */}
              <div className="text-xs text-muted-foreground">
                {checkpoint.clue ? "🧩 Com enigma" : "🧩 Sem enigma — corre guiado"}
              </div>
              {/* What is still to fill in, so planning a route does not mean
                  opening a dozen forms to find the one with a hole in it. */}
              {(checkpoint.missing?.length ?? 0) > 0 && (
                <ul className="mt-1 flex list-none flex-wrap gap-1">
                  {checkpoint.missing?.map((key) => (
                    <li
                      key={key}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px]",
                        checkpoint.is_draft
                          ? "bg-muted text-muted-foreground"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {missingLabel(key)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <BloodyButton
              variant="neutral"
              onClick={() => setShowMedia((v) => !v)}
              aria-expanded={showMedia}
              aria-label="Fotos e curiosidades do sítio"
            >
              <Images className="h-4 w-4" />
              <ChevronDown
                className={cn("ml-1 h-3 w-3 transition-transform", showMedia && "rotate-180")}
              />
            </BloodyButton>
            <BloodyButton variant="neutral" onClick={() => onEdit(checkpoint)}>
              <Edit className="h-4 w-4" />
            </BloodyButton>
            <BloodyButton
              variant="neutral"
              onClick={() => onDelete(checkpoint.id)}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </BloodyButton>
          </div>
        </div>
      </div>
      {showMedia && (
        <div className="rounded-b-xl border border-t-0 border-border bg-card/40 p-4 sm:p-6">
          <CheckpointMediaManager checkpointId={checkpoint.id} />
          <CheckpointGuideIndicationsManager checkpointId={checkpoint.id} />
        </div>
      )}
    </li>
  );
}
