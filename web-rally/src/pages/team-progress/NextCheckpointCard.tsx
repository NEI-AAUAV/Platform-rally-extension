import { MapPin, Navigation } from "lucide-react";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import type { DetailedCheckPoint } from "@/client";

type NextCheckpointCardProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  showMap: boolean;
}>;

export default function NextCheckpointCard({ checkpoint, showMap }: NextCheckpointCardProps) {
  const { Card, config } = useThemedComponents();
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;

  return (
    <div
      className="p-6 rounded-lg border-2 shadow-[0_0_30px_-10px_rgba(0,0,0,0.5)] transform hover:scale-[1.01] transition-all duration-300"
      style={{ borderColor: `${config?.colors?.primary}40`, backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <Card className="border-0 bg-transparent shadow-none p-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl shadow-lg animate-pulse" style={{ backgroundColor: config?.colors?.primary }}>
            <MapPin className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: config?.colors?.text }}>
              Próximo Posto - {checkpoint.name}
            </h2>
            <p className="text-sm opacity-60" style={{ color: config?.colors?.text }}>Dirija-se a este local</p>
          </div>
        </div>
        {showMap && hasCoords && (
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
              className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold shadow-lg transition-all hover:brightness-110 active:scale-95"
              style={{ backgroundColor: config?.colors?.primary, color: '#ffffff' }}
            >
              <Navigation className="w-5 h-5" />
              Abrir no Google Maps
            </a>
          </>
        )}
      </Card>
    </div>
  );
}
