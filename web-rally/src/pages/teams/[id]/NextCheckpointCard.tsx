import { Target, MapPin, Navigation, Lock } from "lucide-react";
import { RallyButton } from "@/components/themes/rally";
import type { DetailedCheckPoint, RallySettingsResponse } from "@/client";
import { directionsUrl } from "@/lib/mapLinks";

type NextCheckpointCardProps = Readonly<{
  /** The post the server says the team is heading to, already redacted for the viewer. */
  nextCheckpoint: DetailedCheckPoint | undefined;
  isRouteFinished: boolean;
  settings: RallySettingsResponse | undefined;
}>;

/**
 * The post this team is heading to.
 *
 * Everything here is the server's answer. The card used to compute the next
 * order as `last_checkpoint_number + 1` — ignoring the
 * `current_checkpoint_number` the payload already carried — and then print the
 * post's name, description, exact coordinates and a Google Maps link with no
 * check at all. On a peddy paper this page is a public team profile, so that
 * was the answer to the riddle, published for another team to read.
 */
export function NextCheckpointCard({
  nextCheckpoint,
  isRouteFinished,
  settings,
}: NextCheckpointCardProps) {
  if (isRouteFinished || !nextCheckpoint) return null;

  const isRedacted = nextCheckpoint.is_redacted === true;
  const hasCoords =
    !isRedacted && nextCheckpoint.latitude != null && nextCheckpoint.longitude != null;

  return (
    <>
      <h2 className="rally-display mb-4 text-2xl font-bold text-foreground">Próximo Posto</h2>
      <div className="rally-surface rally-border-accent mb-8 rounded-2xl border p-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {isRedacted ? (
              <Lock className="rally-accent h-5 w-5" />
            ) : (
              <Target className="rally-accent h-5 w-5" />
            )}
            <h3 className="rally-display text-xl font-semibold text-foreground">
              {isRedacted ? `Posto ${nextCheckpoint.order}` : nextCheckpoint.name}
            </h3>
          </div>
          {isRedacted ? (
            <p className="text-sm text-muted-foreground">
              Ainda por descobrir — o local revela-se quando a equipa lá chegar.
            </p>
          ) : (
            nextCheckpoint.description && (
              <p className="text-sm text-muted-foreground">{nextCheckpoint.description}</p>
            )
          )}
          {settings?.show_checkpoint_map !== false && hasCoords && (
            <div className="space-y-2 pt-2">
              <div className="flex w-fit items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="font-mono">
                  {nextCheckpoint.latitude!.toFixed(6)}, {nextCheckpoint.longitude!.toFixed(6)}
                </span>
              </div>
              <RallyButton asChild variant="primary" size="md">
                <a
                  href={directionsUrl({
                    latitude: nextCheckpoint.latitude!,
                    longitude: nextCheckpoint.longitude!,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation className="h-4 w-4" />
                  Abrir no mapa
                </a>
              </RallyButton>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
