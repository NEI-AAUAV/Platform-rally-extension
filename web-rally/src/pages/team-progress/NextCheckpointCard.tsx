import { MapPin, Navigation } from "lucide-react";
import type { DetailedCheckPoint } from "@/client";

type NextCheckpointCardProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  showMap: boolean;
}>;

export default function NextCheckpointCard({ checkpoint, showMap }: NextCheckpointCardProps) {
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;

  return (
    <div className="rally-surface rally-elevate rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rally-bg-accent flex h-12 w-12 items-center justify-center rounded-xl shadow-[var(--rally-shadow-sm)]">
          <MapPin className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="rally-display text-xl font-bold text-foreground">
            Próximo Posto — {checkpoint.name}
          </h2>
          <p className="text-sm text-muted-foreground">Dirija-se a este local</p>
        </div>
      </div>

      {showMap && hasCoords && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="font-mono">
              {checkpoint.latitude?.toFixed(6)}, {checkpoint.longitude?.toFixed(6)}
            </span>
          </div>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rally-bg-accent rally-press flex items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold text-white transition-all hover:brightness-110"
          >
            <Navigation className="h-5 w-5" />
            Abrir no Google Maps
          </a>
        </div>
      )}
    </div>
  );
}
