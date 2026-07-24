import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, LocateFixed, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import type { DetailedCheckPoint } from "@/client";
import { arriveAtCheckpoint } from "@/client";
import { CheckpointDiscovery } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import { getErrorMessage } from "@/utils/errorHandling";

type NextCheckpointCardProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  showMap: boolean;
}>;

type GpsState = "idle" | "locating" | "done" | "error";

/** "Too far from checkpoint: 240m (max 50m)" → friendly PT message. */
function traduzirDistancia(detail: string): string {
  const suffixMatch = /m \(max \d+m\)$/.exec(detail.trimEnd());
  if (!suffixMatch) {
    return "Ainda estás longe do posto. Aproxima-te e tenta outra vez.";
  }
  const distance = detail.slice(0, suffixMatch.index);
  const maxDistanceMatch = /\d+/.exec(suffixMatch[0]);
  const distanceValue = /\d+$/.exec(distance)?.[0];
  if (!distanceValue || !maxDistanceMatch) {
    return "Ainda estás longe do posto. Aproxima-te e tenta outra vez.";
  }
  return `Ainda estás longe do posto: ${distanceValue} m (tens de estar a menos de ${maxDistanceMatch[0]} m). Aproxima-te e tenta outra vez.`;
}

export default function NextCheckpointCard({ checkpoint, showMap }: NextCheckpointCardProps) {
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsMsg, setGpsMsg] = useState("");
  const qc = useQueryClient();

  const arriveMutation = useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) => {
      const { data } = await arriveAtCheckpoint({
        path: { checkpoint_id: checkpoint.id },
        body: { latitude: lat, longitude: lng },
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.auto_completed) {
        setGpsMsg("Posto concluído! A avançar para o próximo…");
        // Progress changed server-side — refresh team + checkpoints so the
        // route jumps to the next post without a manual reload.
        void qc.invalidateQueries({ queryKey: ["team"] });
        void qc.invalidateQueries({ queryKey: ["checkpoints"] });
      } else if (data.already_registered) {
        setGpsMsg(`Já registado. Distância: ${Math.round(data.distance_m)} m.`);
      } else {
        setGpsMsg(`Check-in registado! Distância: ${Math.round(data.distance_m)} m.`);
      }
      setGpsState("done");
    },
    onError: (err: unknown) => {
      // ApiError.message is a generic "Bad Request"; the useful text
      // ("Too far from checkpoint: …") lives in body.detail.
      const raw = getErrorMessage(err, "Erro ao registar check-in.");
      const msg = raw.startsWith("Too far from checkpoint") ? traduzirDistancia(raw) : raw;
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

  let buttonClasses = "border border-border bg-card text-foreground hover:bg-accent/40";
  if (gpsState === "done") {
    buttonClasses = "cursor-default bg-green-500/15 text-green-600";
  } else if (gpsState === "error") {
    buttonClasses = "bg-red-500/10 text-red-500";
  }

  const renderButtonContent = () => {
    if (gpsState === "locating" || arriveMutation.isPending) {
      return (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />A localizar…
        </>
      );
    }
    if (gpsState === "done") {
      return (
        <>
          <CheckCircle2 className="h-5 w-5" />
          Check-in feito
        </>
      );
    }
    if (gpsState === "error") {
      return (
        <>
          <AlertCircle className="h-5 w-5" />
          Tentar novamente
        </>
      );
    }
    return (
      <>
        <LocateFixed className="h-5 w-5" />
        Check-in GPS
      </>
    );
  };

  return (
    <div className="rally-surface rally-elevate space-y-4 rounded-2xl p-6">
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="font-mono">
            {checkpoint.latitude?.toFixed(6)}, {checkpoint.longitude?.toFixed(6)}
          </span>
        </div>
      )}

      {canCheckin && (
        <div className="space-y-2 border-t border-border pt-4">
          <button
            type="button"
            disabled={gpsState === "locating" || arriveMutation.isPending || gpsState === "done"}
            onClick={handleCheckin}
            className={[
              "rally-press flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold transition-all",
              buttonClasses,
            ].join(" ")}
          >
            {renderButtonContent()}
          </button>
          {gpsMsg && (
            <p
              className={[
                "text-center text-xs",
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
              onClick={() => {
                setGpsState("idle");
                setGpsMsg("");
              }}
            >
              Limpar erro
            </button>
          )}
        </div>
      )}

      {/* Discover the place — revealed as the reward for reaching this stop */}
      {hasDiscovery && (
        <div className="border-t border-border pt-4">
          <div className="rally-accent mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            {gpsState === "done" ? "Chegaste! Descobre o local" : "Sobre este local"}
          </div>
          <CheckpointDiscovery checkpointId={checkpoint.id} description={checkpoint.description} />
        </div>
      )}
    </div>
  );
}
