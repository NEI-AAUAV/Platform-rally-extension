import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DetailedCheckPoint } from "@/client";
import { arriveAtCheckpoint } from "@/client";
import { enqueueArrival } from "@/offline/arrivalQueue";
import { useArrivalSync } from "@/offline/useArrivalSync";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import { getErrorMessage } from "@/utils/errorHandling";

export type GpsState = "idle" | "locating" | "done" | "queued" | "error";

/**
 * Whether a failed check-in is worth queueing for replay.
 *
 * A server that answered — with a detail body, however unwelcome ("too far",
 * "not enabled") — has made a decision, and replaying it later would just
 * repeat the rejection. Only a request that never got an answer is queued.
 */
export function isOfflineFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const candidate = error as
    | { body?: { detail?: unknown }; response?: { data?: { detail?: unknown } } }
    | null
    | undefined;
  return candidate?.body?.detail === undefined && candidate?.response?.data?.detail === undefined;
}

/** The structured half of a rejected arrival, when the server sent one. */
interface TooFarDetails {
  code?: string;
  distance_band?: string;
  max_distance_m?: number;
}

function tooFarDetails(error: unknown): TooFarDetails | null {
  const candidate = error as
    | { body?: { details?: TooFarDetails }; response?: { data?: { details?: TooFarDetails } } }
    | null
    | undefined;
  const details = candidate?.body?.details ?? candidate?.response?.data?.details;
  return details?.code === "too_far" ? details : null;
}

/**
 * The friendly PT sentence for an arrival the server rejected as too far.
 *
 * Built from the server's `details` fields, not from its English message. The
 * band and the radius used to be recovered with a regular expression over
 * that sentence, so rewording it for readability would have silently degraded
 * every one of these into the generic nudge, with nothing failing anywhere to
 * say so.
 *
 * The band itself is deliberately coarse ("menos de 500m") rather than an
 * exact metre count: a team that cannot see a post's coordinates must not be
 * able to trilaterate them from a handful of rejected attempts.
 */
function traduzirDistancia(error: unknown): string {
  const details = tooFarDetails(error);
  if (!details?.distance_band || details.max_distance_m == null) {
    return "Ainda não estás perto o suficiente. Aproxima-te e tenta outra vez.";
  }
  return `Ainda não estás perto o suficiente: ${details.distance_band} (tens de estar a menos de ${details.max_distance_m} m). Aproxima-te e tenta outra vez.`;
}

/**
 * The GPS check-in for one post: taking a fix, sending it, and everything that
 * can happen next.
 *
 * Extracted from NextCheckpointCard because the card is no longer the only
 * place a team can check in. A free-choice stage leaves several posts open at
 * once (RouteStage.order_matters off), and the card only ever renders one — so
 * the route list needs the same button, with the same offline queueing and the
 * same error translation, for every post the server marks reachable.
 */
export function useCheckpointArrival(checkpoint: DetailedCheckPoint) {
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsMsg, setGpsMsg] = useState("");
  const qc = useQueryClient();
  const terms = useEventTerms();
  const feminino = terms.checkpointGender === "f";
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
        // A post with a challenge does not auto-complete, but the team has
        // still arrived — refresh so the route reflects it.
        void qc.invalidateQueries({ queryKey: ["team"] });
        void qc.invalidateQueries({ queryKey: ["checkpoints"] });
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
      // ApiError.message is a generic "Bad Request"; the useful text lives in
      // body.detail, and the machine-readable version in body.details.
      const msg = tooFarDetails(err)
        ? traduzirDistancia(err)
        : getErrorMessage(err, "Erro ao registar check-in.");
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

  /** Dismiss a failed attempt so the button offers itself again. */
  const clearError = () => {
    setGpsState("idle");
    setGpsMsg("");
  };

  return {
    gpsState,
    gpsMsg,
    handleCheckin,
    clearError,
    isQueuedHere,
    isPending: arriveMutation.isPending,
  };
}
