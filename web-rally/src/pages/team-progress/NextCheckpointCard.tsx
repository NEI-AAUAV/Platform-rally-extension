import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation, LocateFixed, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import type { DetailedCheckPoint } from "@/client";
import { CheckpointArriveService } from "@/client";
import { CheckpointDiscovery } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";

type NextCheckpointCardProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  showMap: boolean;
}>;

type GpsState = "idle" | "locating" | "done" | "error";

export default function NextCheckpointCard({ checkpoint, showMap }: NextCheckpointCardProps) {
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsMsg, setGpsMsg] = useState("");
  const qc = useQueryClient();

  const arriveMutation = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) =>
      CheckpointArriveService.arriveAtCheckpointApiRallyV1CheckpointCheckpointIdArrivePost(
        checkpoint.id,
        { latitude: lat, longitude: lng },
      ),
    onSuccess: (data) => {
      if (data.auto_completed) {
        setGpsMsg("Posto concluído! A avançar para o próximo…");
        // Progress changed server-side — refresh team + checkpoints so the
        // route jumps to the next post without a manual reload.
        qc.invalidateQueries({ queryKey: ["team"] });
        qc.invalidateQueries({ queryKey: ["checkpoints"] });
      } else if (data.already_registered) {
        setGpsMsg(`Já registado. Distância: ${Math.round(data.distance_m)} m.`);
      } else {
        setGpsMsg(`Check-in registado! Distância: ${Math.round(data.distance_m)} m.`);
      }
      setGpsState("done");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erro ao registar check-in.";
      setGpsMsg(msg);
      setGpsState("error");
    },
  });

  const handleCheckin = () => {
    if (!navigator.geolocation) {
      setGpsMsg("Geolocalização não suportada pelo browser.");
      setGpsState("error");
      return;
    }
    setGpsState("locating");
    setGpsMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        arriveMutation.mutate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGpsMsg(`Sem acesso à localização: ${err.message}`);
        setGpsState("error");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const canCheckin = hasCoords && (checkpoint.arrival_radius_m ?? 0) > 0;

  const { photos, funFacts } = useCheckpointMedia(checkpoint.id);
  const hasDiscovery = photos.length > 0 || funFacts.length > 0 || !!checkpoint.description;

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

      {canCheckin && (
        <div className="border-t border-border pt-4 space-y-2">
          <button
            type="button"
            disabled={gpsState === "locating" || arriveMutation.isPending || gpsState === "done"}
            onClick={handleCheckin}
            className={[
              "rally-press flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold transition-all",
              gpsState === "done"
                ? "bg-green-500/15 text-green-600 cursor-default"
                : gpsState === "error"
                ? "bg-red-500/10 text-red-500"
                : "border border-border bg-card text-foreground hover:bg-accent/40",
            ].join(" ")}
          >
            {gpsState === "locating" || arriveMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                A localizar…
              </>
            ) : gpsState === "done" ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Check-in feito
              </>
            ) : gpsState === "error" ? (
              <>
                <AlertCircle className="h-5 w-5" />
                Tentar novamente
              </>
            ) : (
              <>
                <LocateFixed className="h-5 w-5" />
                Check-in GPS
              </>
            )}
          </button>
          {gpsMsg && (
            <p
              className={[
                "text-xs text-center",
                gpsState === "done" ? "text-green-600" : "text-red-500",
              ].join(" ")}
            >
              {gpsMsg}
            </p>
          )}
          {gpsState === "error" && (
            <button
              type="button"
              className="w-full text-xs text-muted-foreground underline"
              onClick={() => { setGpsState("idle"); setGpsMsg(""); }}
            >
              Limpar erro
            </button>
          )}
        </div>
      )}

      {/* Discover the place — revealed as the reward for reaching this stop */}
      {hasDiscovery && (
        <div className="border-t border-border pt-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide rally-accent">
            <Sparkles className="h-3.5 w-3.5" />
            {gpsState === "done" ? "Chegaste! Descobre o local" : "Sobre este local"}
          </div>
          <CheckpointDiscovery checkpointId={checkpoint.id} description={checkpoint.description} />
        </div>
      )}
    </div>
  );
}
