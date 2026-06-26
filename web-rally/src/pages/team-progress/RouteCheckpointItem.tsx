import { ChevronDown, ChevronUp, MapPin, Navigation } from "lucide-react";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import { formatTime } from "@/utils/timeFormat";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";

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
  const { Card, config } = useThemedComponents();

  const checkpointOrder = checkpoint.order;
  // Use order-based comparison (1-indexed) so the logic stays correct
  // regardless of which slice the API returns.
  const isCompleted = checkpointOrder <= completedCount;
  const isNext = checkpointOrder === completedCount + 1;
  const isFuture = checkpointOrder > completedCount + 1;
  const checkpointScore = isCompleted ? (team.score_per_checkpoint?.[checkpointOrder - 1] ?? 0) : 0;
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;

  const getCardClass = () => {
    if (isCompleted) return 'bg-muted hover:bg-muted';
    if (isNext) return 'bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/30';
    return 'bg-muted opacity-60 hover:opacity-100';
  };

  const getBadgeClass = () => {
    if (isCompleted) return 'bg-green-500/20 text-green-300';
    if (isNext) return 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/50';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <Card
      className={`cursor-pointer transition-all overflow-hidden backdrop-blur-md border-border ${getCardClass()}`}
      onClick={() => onToggle(index)}
    >
      <div className="p-4 flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getBadgeClass()}`}
            >
              {checkpointOrder}
            </div>
            <div>
              <span
                className={`text-lg font-semibold ${isFuture ? 'text-muted-foreground' : ''}`}
                style={{ color: isFuture ? undefined : config?.colors?.text }}
              >
                {checkpoint.name}
              </span>
              <div className="text-xs flex gap-2">
                {isCompleted && <span className="text-green-400">Concluído</span>}
                {isCompleted && index === completedCount - 1 && (
                  <span className="ml-2 text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded border border-green-500/30">
                    Mais Recente
                  </span>
                )}
                {isNext && <span className="text-indigo-300 font-medium">EM CURSO</span>}
                {isFuture && <span className="text-muted-foreground">Pendente</span>}
              </div>
            </div>
          </div>
          {showScore && isCompleted && (
            <p className="text-sm opacity-60 mt-1 ml-11" style={{ color: config?.colors?.text }}>
              +{checkpointScore} pontos
            </p>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 opacity-50" style={{ color: config?.colors?.text }} />
        ) : (
          <ChevronDown className="w-5 h-5 opacity-50" style={{ color: config?.colors?.text }} />
        )}
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 pl-14 opacity-80 space-y-2 animate-in slide-in-from-top-2">
          {isCompleted && (
            <div className="text-sm" style={{ color: config?.colors?.text }}>
              <span className="opacity-60">Completado às: </span>
              <span className="font-mono font-medium">{formatTime(team.times[checkpointOrder - 1])}</span>
            </div>
          )}

          {(showMap || isCompleted) && hasCoords && (
            <>
              <div className="flex items-center gap-2 text-sm" style={{ color: config?.colors?.text }}>
                <MapPin className="w-4 h-4" />
                <span className="font-mono opacity-80">
                  {checkpoint.latitude?.toFixed(6)}, {checkpoint.longitude?.toFixed(6)}
                </span>
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium hover:underline mt-1"
                style={{ color: config?.colors?.primary }}
                onClick={(e) => e.stopPropagation()}
              >
                <Navigation className="w-4 h-4" />
                Ver no Mapa
              </a>
            </>
          )}

          {!isCompleted && !checkpoint.latitude && (
            <p className="text-sm italic opacity-50">Localização oculta</p>
          )}
        </div>
      )}
    </Card>
  );
}
