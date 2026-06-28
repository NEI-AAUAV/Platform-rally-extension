import { Navigation } from "lucide-react";
import { formatTime } from "@/utils/timeFormat";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";
import { cn } from "@/lib/utils";

type RouteCheckpointItemProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  index: number;
  team: DetailedTeam;
  completedCount: number;
  showScore: boolean;
  showMap: boolean;
  isExpanded: boolean;
  onToggle: (index: number) => void;
  isLast?: boolean;
}>;

export default function RouteCheckpointItem({
  checkpoint,
  index,
  team,
  completedCount,
  showScore,
  showMap,
  isExpanded,
  onToggle,
  isLast = false,
}: RouteCheckpointItemProps) {
  const order = checkpoint.order;
  const isCompleted = order <= completedCount;
  const isCurrent = order === completedCount + 1;
  const isFuture = order > completedCount + 1;

  const checkpointScore = isCompleted ? (team.score_per_checkpoint?.[order - 1] ?? 0) : 0;
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const canExpand = isCompleted || isCurrent;

  const statusLabel = isCompleted ? "Concluído" : isCurrent ? "Em curso" : "Pendente";

  return (
    <div className="flex gap-4">
      {/* dot + connector line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full rally-display text-sm font-bold",
            isCompleted && "rally-bg-accent text-white",
            isCurrent && "rally-bg-accent text-white",
            isFuture && "bg-secondary text-muted-foreground",
          )}
        >
          {isCompleted ? "✓" : order}
        </div>
        {!isLast && (
          <div
            className={cn(
              "mt-1 w-0.5 flex-1",
              isCompleted ? "rally-bg-accent" : "bg-border",
            )}
            style={{ minHeight: "28px" }}
          />
        )}
      </div>

      {/* card */}
      <div className="flex-1 pb-5">
        <div
          role={canExpand ? "button" : undefined}
          tabIndex={canExpand ? 0 : undefined}
          onClick={canExpand ? () => onToggle(index) : undefined}
          onKeyDown={
            canExpand
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") onToggle(index);
                }
              : undefined
          }
          className={cn(
            "rounded-xl border p-4 transition-colors",
            isCompleted && "border-border bg-card cursor-pointer hover:bg-accent/10",
            isCurrent && "rally-border-accent rally-bg-accent-soft cursor-pointer",
            isFuture && "border-border bg-card opacity-60",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "font-bold text-base",
                    isFuture ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {checkpoint.name}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    isCompleted && "rally-bg-accent-soft rally-accent",
                    isCurrent && "rally-bg-accent text-white",
                    isFuture && "bg-secondary text-muted-foreground",
                  )}
                >
                  {statusLabel}
                </span>
              </div>
              {checkpoint.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                  {checkpoint.description}
                </p>
              )}
            </div>
            {showScore && isCompleted && (
              <span className="rally-display rally-accent shrink-0 text-sm font-bold tabular-nums">
                +{checkpointScore} pts
              </span>
            )}
          </div>

          {isExpanded && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {isCompleted && (
                <p className="text-xs text-muted-foreground">
                  Chegada:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {formatTime(team.times[order - 1])}
                  </span>
                </p>
              )}
              {showMap && hasCoords && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rally-accent inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Ver no Mapa
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
