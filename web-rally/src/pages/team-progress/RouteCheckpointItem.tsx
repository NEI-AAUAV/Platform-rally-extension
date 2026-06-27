import { ChevronDown, ChevronUp, MapPin, Navigation } from "lucide-react";
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
}: RouteCheckpointItemProps) {
  const checkpointOrder = checkpoint.order;
  const isCompleted = checkpointOrder <= completedCount;
  const isNext = checkpointOrder === completedCount + 1;
  const isFuture = checkpointOrder > completedCount + 1;
  const checkpointScore = isCompleted ? (team.score_per_checkpoint?.[checkpointOrder - 1] ?? 0) : 0;
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;

  const cardClass = cn(
    "rally-surface cursor-pointer overflow-hidden rounded-xl border transition-colors",
    isCompleted && "border-border bg-muted/60 hover:bg-muted",
    isNext && "rally-border-accent rally-bg-accent-soft hover:bg-accent/10",
    isFuture && "border-border opacity-60 hover:opacity-90",
  );

  const badgeClass = cn(
    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shrink-0",
    isCompleted && "bg-muted text-muted-foreground",
    isNext && "rally-bg-accent text-white",
    isFuture && "bg-secondary text-muted-foreground",
  );

  return (
    <div className={cardClass} onClick={() => onToggle(index)}>
      <div className="flex items-center justify-between p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className={badgeClass}>{checkpointOrder}</div>
            <div className="min-w-0">
              <span className={cn("text-base font-semibold", isFuture ? "text-muted-foreground" : "text-foreground")}>
                {checkpoint.name}
              </span>
              <div className="mt-0.5 flex gap-2 text-xs">
                {isCompleted && (
                  <span className="text-green-600 dark:text-green-400">Concluído</span>
                )}
                {isCompleted && index === completedCount - 1 && (
                  <span className="rounded border border-green-500/30 bg-green-500/15 px-1.5 py-0.5 text-green-600 dark:text-green-300">
                    Mais recente
                  </span>
                )}
                {isNext && <span className="rally-accent font-semibold uppercase tracking-wide">Em curso</span>}
                {isFuture && <span className="text-muted-foreground">Pendente</span>}
              </div>
            </div>
          </div>
          {showScore && isCompleted && (
            <p className="ml-11 mt-1 text-sm text-muted-foreground">
              +{checkpointScore} pontos
            </p>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
      </div>

      {isExpanded && (
        <div className="animate-in slide-in-from-top-2 space-y-2 px-4 pb-4 pl-14">
          {isCompleted && (
            <div className="text-sm text-muted-foreground">
              <span>Completado às: </span>
              <span className="font-mono font-medium text-foreground">
                {formatTime(team.times[checkpointOrder - 1])}
              </span>
            </div>
          )}
          {(showMap || isCompleted) && hasCoords && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="font-mono">
                  {checkpoint.latitude?.toFixed(6)}, {checkpoint.longitude?.toFixed(6)}
                </span>
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rally-accent mt-1 inline-flex items-center gap-2 text-sm font-semibold hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Navigation className="h-4 w-4" />
                Ver no Mapa
              </a>
            </>
          )}
          {!isCompleted && !checkpoint.latitude && (
            <p className="text-sm italic text-muted-foreground">Localização oculta</p>
          )}
        </div>
      )}
    </div>
  );
}
