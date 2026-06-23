import { Target, MapPin, Navigation } from "lucide-react";
import { useThemedComponents } from "@/components/themes";
import type { DetailedTeam, DetailedCheckPoint, RallySettingsResponse } from "@/client";

interface NextCheckpointCardProps {
  team: DetailedTeam;
  checkpoints: DetailedCheckPoint[] | undefined;
  totalCount: number;
  settings: RallySettingsResponse | undefined;
}

export function NextCheckpointCard({ team, checkpoints, totalCount, settings }: NextCheckpointCardProps) {
  const { Card } = useThemedComponents();

  const completedCheckpointsCount = team?.last_checkpoint_number ?? team?.times?.length ?? 0;
  const hasMore = completedCheckpointsCount < (totalCount || 0);
  if (!(settings?.show_route_mode === "complete" || hasMore)) return null;

  const nextCheckpointOrder = completedCheckpointsCount + 1;
  const nextCheckpoint = checkpoints?.find((cp) => cp.order === nextCheckpointOrder);

  return (
    <>
      <h2 className="mb-4 font-playfair text-2xl font-semibold">Próximo Posto</h2>
      {nextCheckpoint && (
        <Card variant="default" padding="lg" rounded="2xl" className="mb-8 border-2 border-yellow-500/50 bg-yellow-500/10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-yellow-300" />
              <h3 className="text-xl font-semibold text-yellow-300">{nextCheckpoint.name}</h3>
            </div>
            {nextCheckpoint.description && (
              <p className="text-sm text-white/70">{nextCheckpoint.description}</p>
            )}
            {settings?.show_checkpoint_map !== false && nextCheckpoint.latitude && nextCheckpoint.longitude && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-sm text-white/80 bg-white/5 px-3 py-2 rounded-lg w-fit">
                  <MapPin className="w-4 h-4" />
                  <span className="font-mono">
                    {nextCheckpoint.latitude?.toFixed(6)}, {nextCheckpoint.longitude?.toFixed(6)}
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${nextCheckpoint.latitude},${nextCheckpoint.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-all"
                >
                  <Navigation className="w-4 h-4" />
                  Abrir no Google Maps
                </a>
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
