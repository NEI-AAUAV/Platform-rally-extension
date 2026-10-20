import { Navigation, Sparkles } from "lucide-react";
import { CheckpointDiscovery } from "@/components/shared";
import type { CheckpointProgress, DetailedCheckPoint } from "@/client";
import useEventTerms from "@/hooks/useEventTerms";
import ProximityButton from "./ProximityButton";
import CheckpointHeader from "./CheckpointHeader";
import CheckpointClue from "./CheckpointClue";
import CheckpointHints from "./CheckpointHints";
import CheckpointGiveUpAction from "./CheckpointGiveUpAction";
import CheckpointArrivalAction from "./CheckpointArrivalAction";
import CheckpointConfirmDialog from "./CheckpointConfirmDialog";
import { useNextCheckpointState } from "./useNextCheckpointState";

type NextCheckpointCardProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  showMap: boolean;
  /** Set while the team's own departure is still ahead; see departureNotice. */
  notYetDeparted?: string | null;
  checkpointProgress?: CheckpointProgress;
}>;

function persistentStatusNotice(status: string): string | null {
  if (status === "arrived") return "Chegada registada — a aguardar atividade/avaliação.";
  if (status === "completed") return "Posto concluído.";
  if (status === "skipped") return "Desistência registada neste posto.";
  return null;
}

/**
 * Composes the next-checkpoint experience from useNextCheckpointState's view
 * model and a handful of focused subcomponents. This component itself should
 * stay mostly layout — domain/settings logic lives in the hook, not here.
 */
export default function NextCheckpointCard({
  checkpoint,
  showMap,
  notYetDeparted = null,
  checkpointProgress,
}: NextCheckpointCardProps) {
  const terms = useEventTerms();
  const { hasCoords, isRedacted, feminino, persistent, access, ui, hints, actions } =
    useNextCheckpointState(checkpoint, checkpointProgress);

  // notYetDeparted takes priority over the checkpoint's own hours — a team
  // that hasn't left yet can't be "at" this post regardless of its window.
  const openingNotice = notYetDeparted ?? access.openingNotice;
  const canCheckin = access.canCheckin && openingNotice === null;
  const isTerminal = persistent.isCompleted || persistent.isSkipped;
  const persistentNotice = persistentStatusNotice(persistent.status);

  const directionsUrl =
    showMap && hasCoords && !isRedacted
      ? `https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`
      : null;
  // Only float a bar when it has something in it — an empty glass slab over
  // the tab bar would be worse than nothing.
  const showArrival =
    !persistent.hasArrived &&
    !persistent.isSkipped &&
    (canCheckin || openingNotice !== null || access.settingsUnavailable);

  return (
    <article className="rally-surface rally-border-accent space-y-4 border-2 p-5 sm:p-6">
      <CheckpointHeader
        name={checkpoint.name}
        isRedacted={isRedacted}
        feminino={feminino}
        checkpointTerm={terms.checkpoint}
      />

      {persistentNotice && (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm font-medium text-foreground">
          {persistentNotice}
        </p>
      )}

      <CheckpointClue
        isRedacted={isRedacted}
        clue={checkpoint.clue}
        clueMediaUrl={checkpoint.clue_media_url}
      />

      {!isTerminal && (
        <CheckpointHints
          hints={hints}
          hasHintLadder={access.hasHintLadder}
          hintCostLabel={access.hintCostLabel}
          totalSpent={access.totalSpent}
          onRequestHint={actions.requestHint}
        />
      )}

      {/* Defense in depth: the backend already strips coordinates from a
          redacted checkpoint's payload, but this component must not use
          them either if it ever receives some anyway — a post's secret must
          not leak through two independent failures instead of one. */}
      {(directionsUrl || (!isTerminal && access.proximityEnabled)) && (
        <div className="flex flex-wrap items-center gap-2">
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="rally-press inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent/40"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Como chegar
            </a>
          )}
          {!isTerminal && access.proximityEnabled && (
            <ProximityButton checkpointId={checkpoint.id} />
          )}
        </div>
      )}

      {/* On a phone the check-in floats above the tab bar (and the QR button
          that sits on it) so the one thing the team came here to do is
          always within thumb reach; from lg up it is inline in the panel. */}
      {showArrival && (
        <div className="rally-glass rally-glass-solid rally-elevate-lg fixed inset-x-3 bottom-[calc(var(--safe-bottom)+8.75rem)] z-40 space-y-2 rounded-2xl border border-border/60 p-3 sm:bottom-6 lg:static lg:inset-auto lg:z-auto lg:space-y-3 lg:rounded-none lg:border-x-0 lg:border-b-0 lg:bg-transparent lg:p-0 lg:border-t lg:pt-4 lg:shadow-none lg:backdrop-blur-none">
          <CheckpointArrivalAction
            openingNotice={openingNotice}
            settingsUnavailable={access.settingsUnavailable}
            canCheckin={canCheckin}
            gpsState={ui.gpsState}
            gpsMsg={ui.gpsMsg}
            isQueuedHere={ui.isQueuedHere}
            isPending={ui.isPending}
            onCheckin={actions.handleCheckin}
            onClearError={actions.clearError}
            onRetrySettings={() => void actions.refetchSettings()}
            bare
          />
        </div>
      )}

      {/* Discover the place — revealed as the reward for reaching this stop */}
      {access.hasDiscovery && (
        <div className="border-t border-border pt-4">
          <div className="rally-accent mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            {ui.gpsState === "done" ? "Chegaste! Descobre o local" : "Sobre este local"}
          </div>
          <CheckpointDiscovery
            checkpointId={checkpoint.id}
            description={access.discoveryDescription}
          />
        </div>
      )}

      {!isTerminal && (
        <CheckpointGiveUpAction
          canGiveUp={access.canGiveUp}
          skipCost={access.skipCost}
          giveUp={hints.giveUp}
          onRequestGiveUp={actions.requestGiveUp}
        />
      )}

      <CheckpointConfirmDialog
        pendingAction={ui.pendingAction}
        skipCost={access.skipCost}
        nextHintCost={hints.nextCost}
        onConfirm={actions.confirmPendingAction}
        onClose={actions.closeConfirm}
      />
    </article>
  );
}
