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
  Lightbulb,
} from "lucide-react";
import type { DetailedCheckPoint } from "@/client";
import { arriveAtCheckpoint } from "@/client";
import { CheckpointDiscovery } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import useCheckpointHints from "@/hooks/useCheckpointHints";
import ProximityButton from "./ProximityButton";
import useRallySettings from "@/hooks/useRallySettings";
import { enqueueArrival } from "@/offline/arrivalQueue";
import { useArrivalSync } from "@/offline/useArrivalSync";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import { getErrorMessage } from "@/utils/errorHandling";
import { checkpointOpeningNotice } from "./checkpointHours";

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

const BUTTON_CLASSES: Record<GpsState, string> = {
  idle: "border border-border bg-card text-foreground hover:bg-accent/40",
  locating: "border border-border bg-card text-foreground hover:bg-accent/40",
  done: "cursor-default bg-green-500/15 text-green-600",
  queued: "bg-amber-500/15 text-amber-600",
  error: "bg-red-500/10 text-red-500",
};

const MESSAGE_CLASSES: Record<GpsState, string> = {
  idle: "text-red-500",
  locating: "text-red-500",
  done: "text-green-600",
  queued: "text-amber-600",
  error: "text-red-500",
};

function ButtonContent({ gpsState, isPending }: { gpsState: GpsState; isPending: boolean }) {
  if (gpsState === "locating" || isPending) {
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

  // The server flags a checkpoint the team has not reached yet: its name is a
  // placeholder and its coordinates were stripped. Without a clue there is
  // then nothing in the app to go on, so say so rather than showing a bare
  // "Posto 3" and no instruction at all.
  const isRedacted = checkpoint.is_redacted === true;

  // Don't offer a button the server will reject: GPS check-in needs the event
  // setting on *and* a real geofence radius. Coordinates are deliberately NOT
  // required when the post is redacted — that is exactly the peddy-paper case,
  // where the server withholds them *because* finding the place is the game.
  // Requiring them here hid the check-in button for the entire mode. The
  // distance check happens server-side either way; the client never needed the
  // coordinates to ask.
  // A post with its own opening window (the bars) refuses check-ins outside
  // it server-side. Saying so here — with the hour — is the difference
  // between "the app is broken" and "come back at ten".
  const openingNotice = checkpointOpeningNotice(checkpoint);

  const canCheckin =
    settings?.gps_checkin_enabled === true &&
    (hasCoords || isRedacted) &&
    (checkpoint.arrival_radius_m ?? 0) > 0 &&
    openingNotice === null;

  // Hints are the peddy-paper safety valve: help toward the riddle, paid for
  // in points. A checkpoint with no guide indications has no ladder and the
  // whole block stays out of the card.
  const hints = useCheckpointHints(checkpoint.id);
  // Hints already bought stay readable even with the mechanic off — the team
  // paid for them; the server just stops offering more.
  const hasHintLadder = hints.revealed.length > 0 || hints.remaining > 0;
  const hintCostLabel = hints.nextCost === 0 ? "" : ` (${hints.nextCost} pts)`;
  const totalSpent = hints.revealed.reduce((sum, item) => sum + item.cost, 0);
  const confirmHint = () =>
    hints.nextCost === 0 ||
    globalThis.confirm(`Pedir uma pista custa ${Math.abs(hints.nextCost)} pontos. Continuar?`);

  // The way out of an unsolvable riddle. Offered only once the hint ladder is
  // spent, so it reads as a last resort rather than a shortcut — the server
  // allows it at any point, this is a nudge, not the rule.
  const skipCost = settings?.skip_penalty ?? 0;
  const canGiveUp = settings?.skip_enabled !== false && isRedacted && hints.remaining === 0;
  const confirmGiveUp = () =>
    globalThis.confirm(
      skipCost === 0
        ? "Desistir deste posto? Não o vais pontuar, e passas ao enigma seguinte."
        : `Desistir deste posto custa ${Math.abs(skipCost)} pontos e não o vais pontuar. Continuar?`,
    );

  const { photos, funFacts } = useCheckpointMedia(checkpoint.id);
  // The server mirrors the clue into `description` on a redacted checkpoint so
  // description-only clients still show something. Here the clue has its own
  // panel, so don't let the discovery block repeat it.
  const discoveryDescription =
    checkpoint.description && checkpoint.description === checkpoint.clue
      ? null
      : checkpoint.description;
  const hasDiscovery = photos.length > 0 || funFacts.length > 0 || !!discoveryDescription;

  const buttonClasses = BUTTON_CLASSES[gpsState];
  const messageClasses = MESSAGE_CLASSES[gpsState];

  let giveUpButtonText = "A desistir…";
  if (!hints.giveUp.isPending) {
    giveUpButtonText =
      skipCost === 0 ? "Desistir deste posto" : `Desistir deste posto (${skipCost} pts)`;
  }

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
          <p className="text-sm text-muted-foreground">
            {isRedacted ? "Descobre onde é" : "Dirija-se a este local"}
          </p>
        </div>
      </div>

      {isRedacted && !checkpoint.clue && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Sem enigma na app — aguarda as indicações do guia no local de partida.
        </p>
      )}

      {/* The riddle: this is the whole game in a peddy paper, so it sits above
          the fold, before the map and the check-in button. Absent clue means a
          guided event — nothing renders and the card behaves as it always did. */}
      {checkpoint.clue && (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="rally-accent mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            Enigma
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {checkpoint.clue}
          </p>
          {checkpoint.clue_media_url && (
            <img
              src={checkpoint.clue_media_url}
              alt="Pista visual do enigma"
              loading="lazy"
              className="mt-3 max-h-64 w-full rounded-lg object-cover"
            />
          )}
        </div>
      )}

      {hasHintLadder && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            Pistas
          </div>
          {hints.revealed.map((item) => (
            <div key={item.indication_id} className="flex items-start justify-between gap-3">
              <p className="text-sm leading-relaxed text-foreground">• {item.hint}</p>
              {/* What this hint cost, at the price it was bought for. Nothing
                  else in the team's app shows the deduction — the awards that
                  carry it are admin-only — so without this the score just
                  drops with no explanation. */}
              {item.cost !== 0 && (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {item.cost} pts
                </span>
              )}
            </div>
          ))}
          {totalSpent !== 0 && (
            <p className="text-xs text-muted-foreground">
              Neste posto: {totalSpent} pts
              {hints.totalSpentInEvent !== totalSpent &&
                ` · em todo o percurso: ${hints.totalSpentInEvent} pts`}
            </p>
          )}
          {hints.remaining > 0 && (
            <button
              type="button"
              disabled={hints.reveal.isPending}
              onClick={() => {
                // Points are spent here, so never on a stray tap.
                if (confirmHint()) hints.reveal.mutate();
              }}
              className="rally-press w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold transition-all hover:bg-accent/40 disabled:opacity-60"
            >
              {hints.reveal.isPending
                ? "A revelar…"
                : `Pedir pista${hintCostLabel} · faltam ${hints.remaining}`}
            </button>
          )}
          {hints.reveal.isError && (
            <p className="text-center text-xs text-red-500">
              {isOfflineFailure(hints.reveal.error)
                ? // Deliberately not queued like an arrival. A check-in is a
                  // fact about where the team stood, safe to replay; buying a
                  // hint spends points, and replaying it later would charge
                  // them for a hint nobody was there to read — possibly at a
                  // post they have since left. Say so instead of failing
                  // silently or queueing.
                  "Sem rede. Pede a pista quando tiveres ligação — não fica guardada para não gastares pontos sem veres o resultado."
                : getErrorMessage(hints.reveal.error, "Não foi possível revelar a pista.")}
            </p>
          )}
        </div>
      )}

      {isRedacted && settings?.proximity_enabled === true && (
        <ProximityButton checkpointId={checkpoint.id} />
      )}

      {canGiveUp && (
        <div className="space-y-2 border-t border-border pt-4">
          <button
            type="button"
            disabled={hints.giveUp.isPending}
            onClick={() => {
              if (confirmGiveUp()) hints.giveUp.mutate();
            }}
            className="rally-press w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground transition-all hover:bg-accent/30 disabled:opacity-60"
          >
            {giveUpButtonText}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Sem pistas por revelar. Se não conseguem mesmo, desistam e sigam para o próximo — mais
            vale isso do que ficarem aqui presos o resto do evento.
          </p>
          {hints.giveUp.isError && (
            <p className="text-center text-xs text-red-500">
              {getErrorMessage(hints.giveUp.error, "Não foi possível desistir do posto.")}
            </p>
          )}
        </div>
      )}

      {showMap && hasCoords && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="font-mono">
            {checkpoint.latitude?.toFixed(6)}, {checkpoint.longitude?.toFixed(6)}
          </span>
          {/* Only ever offered for a post that is no longer a secret: opening
              a maps app for a redacted one would be handing over the answer. */}
          {!isRedacted && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="rally-accent font-semibold underline"
            >
              Como chegar
            </a>
          )}
        </div>
      )}

      {openingNotice && (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {openingNotice}
        </p>
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
            <ButtonContent gpsState={gpsState} isPending={arriveMutation.isPending} />
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
          <CheckpointDiscovery checkpointId={checkpoint.id} description={discoveryDescription} />
        </div>
      )}
    </div>
  );
}
