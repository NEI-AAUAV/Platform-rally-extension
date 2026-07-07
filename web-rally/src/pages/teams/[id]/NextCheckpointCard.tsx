import { Target, MapPin, Navigation } from "lucide-react";
import type { DetailedTeam, DetailedCheckPoint, RallySettingsResponse } from "@/client";

type NextCheckpointCardProps = Readonly<{
  team: DetailedTeam;
  checkpoints: DetailedCheckPoint[] | undefined;
  totalCount: number;
  settings: RallySettingsResponse | undefined;
}>;

export function NextCheckpointCard({
  team,
  checkpoints,
  totalCount,
  settings,
}: NextCheckpointCardProps) {
  const completedCheckpointsCount = team?.last_checkpoint_number ?? team?.times?.length ?? 0;
  const hasMore = completedCheckpointsCount < (totalCount || 0);
  if (!(settings?.show_route_mode === "complete" || hasMore)) return null;

  const nextCheckpointOrder = completedCheckpointsCount + 1;
  const nextCheckpoint = checkpoints?.find((cp) => cp.order === nextCheckpointOrder);

  return (
    <>
      <h2 className="rally-display mb-4 text-2xl font-bold text-foreground">Próximo Posto</h2>
      {nextCheckpoint && (
        <div className="rally-surface rally-border-accent mb-8 rounded-2xl border p-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="rally-accent h-5 w-5" />
              <h3 className="rally-display text-xl font-semibold text-foreground">
                {nextCheckpoint.name}
              </h3>
            </div>
            {nextCheckpoint.description && (
              <p className="text-sm text-muted-foreground">{nextCheckpoint.description}</p>
            )}
            {settings?.show_checkpoint_map !== false &&
              nextCheckpoint.latitude &&
              nextCheckpoint.longitude && (
                <div className="space-y-2 pt-2">
                  <div className="flex w-fit items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="font-mono">
                      {nextCheckpoint.latitude?.toFixed(6)}, {nextCheckpoint.longitude?.toFixed(6)}
                    </span>
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${nextCheckpoint.latitude},${nextCheckpoint.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rally-bg-accent rally-press inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-white"
                  >
                    <Navigation className="h-4 w-4" />
                    Abrir no Google Maps
                  </a>
                </div>
              )}
          </div>
        </div>
      )}
    </>
  );
}
