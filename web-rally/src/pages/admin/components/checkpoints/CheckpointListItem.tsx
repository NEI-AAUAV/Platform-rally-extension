import React, { useState } from "react";
import {
  Edit,
  Trash2,
  GripVertical,
  Images,
  ChevronDown,
  Compass,
  Clock,
  MapPin,
  Puzzle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BloodyButton } from "@/components/themes/bloody";
import type { RouteStageResponse } from "@/client";
import type { Checkpoint } from "./useCheckpointManagement";
import CheckpointMediaManager from "./CheckpointMediaManager";
import CheckpointGuideIndicationsManager from "./CheckpointGuideIndicationsManager";
import CheckpointActivitiesManager from "./CheckpointActivitiesManager";
import { missingLabel } from "./routeReadiness";
import { checkpointOpeningNotice } from "@/pages/team-progress/checkpointHours";

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
  /** To resolve the checkpoint's stage name; empty when the route has none. */
  stages?: ReadonlyArray<RouteStageResponse>;
  /**
   * Force the panel open, e.g. right after this post was created — landing
   * the admin straight on media/indications/activity instead of a click away.
   * Uncontrolled (starts closed, toggles freely) when omitted.
   */
  forceExpanded?: boolean;
}>;

function formatWindow(from: string | null | undefined, until: string | null | undefined): string {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  if (from && until) return `${time(from)}–${time(until)}`;
  if (from) return `abre ${time(from)}`;
  return `fecha ${time(until as string)}`;
}

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
  stages,
  forceExpanded,
}: CheckpointListItemProps) {
  // Seeds the initial state only — after mount this is a normal toggle, so a
  // post that opened itself on creation can still be collapsed like any
  // other. (Composing `forceExpanded || state` instead would work for
  // opening but make the toggle button permanently unable to close it.)
  const [showMedia, setShowMedia] = useState(forceExpanded ?? false);
  const stage = stages?.find((s) => s.id === checkpoint.stage_id);
  const hasWindow = Boolean(checkpoint.available_from || checkpoint.available_until);

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
              {(stage || hasWindow) && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {stage && (
                    <span className="flex items-center gap-1">
                      <Compass className="h-3 w-3" />
                      {stage.name}
                    </span>
                  )}
                  {hasWindow && (
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        checkpointOpeningNotice(checkpoint) && "text-amber-600",
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {formatWindow(checkpoint.available_from, checkpoint.available_until)}
                    </span>
                  )}
                </div>
              )}
              {(checkpoint.latitude || checkpoint.longitude) && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {checkpoint.latitude}, {checkpoint.longitude}
                  {checkpoint.arrival_radius_m ? ` · raio ${checkpoint.arrival_radius_m}m` : ""}
                </div>
              )}
              {/* Setting up a route means checking a dozen posts have a riddle;
                  say so here instead of opening each form to find out. */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Puzzle className="h-3 w-3" />
                {checkpoint.clue ? "Com enigma" : "Sem enigma — corre guiado"}
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
          <CheckpointActivitiesManager checkpointId={checkpoint.id} />
          <CheckpointMediaManager checkpointId={checkpoint.id} />
          <CheckpointGuideIndicationsManager checkpointId={checkpoint.id} />
        </div>
      )}
    </li>
  );
}
