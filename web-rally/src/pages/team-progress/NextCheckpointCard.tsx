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
import { useState } from "react";
import type { DetailedCheckPoint } from "@/client";
import { CheckpointDiscovery } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import useCheckpointHints from "@/hooks/useCheckpointHints";
import ProximityButton from "./ProximityButton";
import useRallySettings from "@/hooks/useRallySettings";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import { getErrorMessage } from "@/utils/errorHandling";
import { checkpointOpeningNotice } from "./checkpointHours";
import { useCheckpointArrival, isOfflineFailure, type GpsState } from "./useCheckpointArrival";

type NextCheckpointCardProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  showMap: boolean;
  /** Set while the team's own departure is still ahead; see departureNotice. */
  notYetDeparted?: string | null;
}>;

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

export default function NextCheckpointCard({
  checkpoint,
  showMap,
  notYetDeparted = null,
}: NextCheckpointCardProps) {
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const { settings, error: settingsError, refetch: refetchSettings } = useRallySettings();
  // "posto" for a peddy-paper, "tasca" for a rally — this card renders for
  // every event type, so the copy follows the event's terminology.
  const terms = useEventTerms();
  const feminino = terms.checkpointGender === "f";
  const { gpsState, gpsMsg, handleCheckin, clearError, isQueuedHere, isPending } =
    useCheckpointArrival(checkpoint);

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
  // Two ways a post can be shut to this team right now: the post's own hours,
  // and the team's own departure. Either one hides the button and says why.
  const openingNotice =
    notYetDeparted ??
    checkpointOpeningNotice(checkpoint, undefined, settings?.checkpoint_hours_enabled !== false);

  const canCheckin =
    settings?.gps_checkin_enabled === true &&
    (hasCoords || isRedacted) &&
    (checkpoint.arrival_radius_m ?? 0) > 0 &&
    openingNotice === null;

  // Every condition above reads the event settings, so a settings fetch that
  // failed leaves this card with no button and nothing to explain it — a team
  // standing at the post, looking at a screen that offers nothing. The hook
  // gives up after two retries and `retryOnMount: false` means nothing brings
  // it back, so the state is permanent until the page is reloaded. Say what
  // happened and offer the retry, rather than looking broken in silence.
  const settingsUnavailable = !settings && !!settingsError;

  // Hints are the peddy-paper safety valve: help toward the riddle, paid for
  // in points. A checkpoint with no guide indications has no ladder and the
  // whole block stays out of the card.
  const hints = useCheckpointHints(checkpoint.id);
  // Hints already bought stay readable even with the mechanic off — the team
  // paid for them; the server just stops offering more.
  const hasHintLadder = hints.revealed.length > 0 || hints.remaining > 0;
  const hintCostLabel = hints.nextCost === 0 ? "" : ` (${hints.nextCost} pts)`;
  const totalSpent = hints.revealed.reduce((sum, item) => sum + item.cost, 0);

  // The way out of an unsolvable riddle. Offered only once the hint ladder is
  // spent, so it reads as a last resort rather than a shortcut — the server
  // allows it at any point, this is a nudge, not the rule.
  //
  // "Spent" has to mean the team actually climbed the ladder. With
  // `hints_enabled` off the server reports `remaining: 0` because there is
  // nothing to buy, not because anything was bought — so keying off the count
  // alone put the give-up button on every redacted post from the first second,
  // which is the opposite of a last resort. When the mechanic is off there is
  // no ladder to spend, so the nudge has nothing to wait for and the button is
  // offered straight away; when it is on, it waits for the ladder.
  const skipCost = settings?.skip_penalty ?? 0;
  const hintsOff = settings?.hints_enabled === false;
  const hintLadderSpent = hintsOff || (hasHintLadder && hints.remaining === 0);
  const canGiveUp = settings?.skip_enabled !== false && isRedacted && hintLadderSpent;

  // Both actions spend points, so each goes through an in-app confirmation
  // instead of the browser's confirm() — the native dialog breaks out of the
  // app's look and, on some mobile webviews, does not appear at all.
  const [pendingAction, setPendingAction] = useState<null | "hint" | "giveUp">(null);
  const closeConfirm = () => setPendingAction(null);
  const confirmPendingAction = () => {
    if (pendingAction === "hint") hints.reveal.mutate();
    else if (pendingAction === "giveUp") hints.giveUp.mutate();
    setPendingAction(null);
  };
  const confirmCopy =
    pendingAction === "giveUp"
      ? {
          title: "Desistir deste posto?",
          description:
            skipCost === 0
              ? "Não o vais pontuar, e passas ao enigma seguinte."
              : `Custa ${Math.abs(skipCost)} pontos e não o vais pontuar.`,
          action: "Desistir",
        }
      : {
          title: "Pedir uma pista?",
          description: `Custa ${Math.abs(hints.nextCost)} pontos.`,
          action: "Pedir pista",
        };

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
                // Points are spent here, so never on a stray tap. A free hint
                // skips the prompt.
                if (hints.nextCost === 0) hints.reveal.mutate();
                else setPendingAction("hint");
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
            onClick={() => setPendingAction("giveUp")}
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

      {settingsUnavailable && (
        <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <p>
            Não foi possível carregar as definições da prova, por isso o check-in está indisponível.
          </p>
          <button
            type="button"
            onClick={() => void refetchSettings()}
            className="rally-press w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-accent/40"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {canCheckin && (
        <div className="space-y-2 border-t border-border pt-4">
          <button
            type="button"
            disabled={gpsState === "locating" || isPending || gpsState === "done"}
            onClick={handleCheckin}
            className={[
              "rally-press flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold transition-all",
              buttonClasses,
            ].join(" ")}
          >
            <ButtonContent gpsState={gpsState} isPending={isPending} />
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
              onClick={clearError}
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

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && closeConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAction}>
              {confirmCopy.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
