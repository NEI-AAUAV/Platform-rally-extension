import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  LocateFixed,
  CheckCircle2,
  AlertCircle,
  CloudOff,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { DetailedCheckPoint } from "@/client";
import { arriveAtCheckpoint } from "@/client";
import { CheckpointDiscovery } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import useRallySettings from "@/hooks/useRallySettings";
import { enqueueArrival } from "@/offline/arrivalQueue";
import { useArrivalSync } from "@/offline/useArrivalSync";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import { getErrorMessage } from "@/utils/errorHandling";

type NextCheckpointCardProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  showMap: boolean;
}>;

type GpsState = "idle" | "locating" | "done" | "queued" | "error";

/**
 * Whether a failed check-in is worth queueing for replay.
 *
 * A server that answered — with a detail body, however unwelcome ("too far",
 * "not enabled") — has made a decision, and replaying it later would just
 * repeat the rejection. Only a request that never got an answer is queued.
 */
function isOfflineFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const candidate = error as
    | { body?: { detail?: unknown }; response?: { data?: { detail?: unknown } } }
    | null
    | undefined;
  return candidate?.body?.detail === undefined && candidate?.response?.data?.detail === undefined;
}

/**
 * "Too far from checkpoint: menos de 500m (max 50m)" → friendly PT message.
 *
 * The server reports a coarse distance band rather than an exact metre count,
 * so a team cannot trilaterate a hidden post from repeated rejections. Anything
 * that does not parse falls back to the generic nudge.
 */
function traduzirDistancia(detail: string): string {
  const match = /: (.+) \(max (\d+)m\)$/.exec(detail.trimEnd());
  if (!match) {
    return "Ainda não estás perto o suficiente. Aproxima-te e tenta outra vez.";
  }
  const [, band, maxDistance] = match;
  return `Ainda não estás perto o suficiente: ${band} (tens de estar a menos de ${maxDistance} m). Aproxima-te e tenta outra vez.`;
}

export default function NextCheckpointCard({ checkpoint, showMap }: NextCheckpointCardProps) {
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const { settings } = useRallySettings();
  // "posto" for a peddy-paper, "tasca" for a rally — this card renders for
  // every event type, so the copy follows the event's terminology.
  const terms = useEventTerms();
  const feminino = terms.checkpointGender === "f";
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsMsg, setGpsMsg] = useState("");
  const qc = useQueryClient();
  // Replays anything queued by an earlier offline attempt, including from a
  // previous app launch — iOS kills backgrounded PWAs, so the tab that queued
  // an arrival is often not the tab that gets to send it.
  const { queued } = useArrivalSync();
  const isQueuedHere = queued.some((item) => item.checkpointId === checkpoint.id);

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
        setGpsMsg(
          `${capitalize(terms.checkpoint)} concluíd${feminino ? "a" : "o"}! A avançar para ${feminino ? "a próxima" : "o próximo"}…`,
        );
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
    onError: async (err: unknown, variables) => {
      // The request never reached the server: keep the coordinates captured
      // here and replay them when the signal comes back, so the team is
      // credited for where they stood rather than losing the post.
      if (isOfflineFailure(err)) {
        await enqueueArrival({
          checkpointId: checkpoint.id,
          latitude: variables.lat,
          longitude: variables.lng,
        });
        setGpsMsg("Sem rede. Check-in guardado — será enviado assim que houver ligação.");
        setGpsState("queued");
        return;
      }
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

  // Don't offer a button the server will reject: GPS check-in needs the event
  // setting on *and* a post with coordinates and a real geofence radius.
  const canCheckin =
    settings?.gps_checkin_enabled === true && hasCoords && (checkpoint.arrival_radius_m ?? 0) > 0;

  const { photos, funFacts } = useCheckpointMedia(checkpoint.id);
  const hasDiscovery = photos.length > 0 || funFacts.length > 0 || !!checkpoint.description;

  let buttonClasses = "border border-border bg-card text-foreground hover:bg-accent/40";
  if (gpsState === "done") {
    buttonClasses = "cursor-default bg-green-500/15 text-green-600";
  } else if (gpsState === "queued") {
    buttonClasses = "bg-amber-500/15 text-amber-600";
  } else if (gpsState === "error") {
    buttonClasses = "bg-red-500/10 text-red-500";
  }

  let messageClasses = "text-red-500";
  if (gpsState === "done") {
    messageClasses = "text-green-600";
  } else if (gpsState === "queued") {
    messageClasses = "text-amber-600";
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
    if (gpsState === "queued") {
      return (
        <>
          <CloudOff className="h-5 w-5" />
          Guardado — tentar novamente
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
            {feminino ? "Próxima" : "Próximo"} {capitalize(terms.checkpoint)} — {checkpoint.name}
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
          {gpsMsg && <p className={["text-center text-xs", messageClasses].join(" ")}>{gpsMsg}</p>}
          {isQueuedHere && gpsState !== "queued" && (
            <p className="text-center text-xs text-amber-600">
              Há um check-in por enviar para este local. Será enviado assim que houver ligação.
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
