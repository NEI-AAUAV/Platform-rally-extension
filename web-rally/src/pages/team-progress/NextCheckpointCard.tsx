import { MapPin, Sparkles } from "lucide-react";
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
  const persistentNotice =
    persistent.status === "arrived"
      ? "Chegada registada — a aguardar atividade/avaliação."
      : persistent.status === "completed"
        ? "Posto concluído."
        : persistent.status === "skipped"
          ? "Desistência registada neste posto."
          : null;

  return (
    <div className="rally-surface rally-elevate space-y-4 rounded-2xl p-6">
      <CheckpointHeader
        name={checkpoint.name}
        isRedacted={isRedacted}
        feminino={feminino}
        checkpointTerm={terms.checkpoint}
      />

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

      {persistentNotice && (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {persistentNotice}
        </p>
      )}

      {!isTerminal && access.proximityEnabled && <ProximityButton checkpointId={checkpoint.id} />}

      {!isTerminal && (
        <CheckpointGiveUpAction
          canGiveUp={access.canGiveUp}
          skipCost={access.skipCost}
          giveUp={hints.giveUp}
          onRequestGiveUp={actions.requestGiveUp}
        />
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

      {!persistent.hasArrived && !persistent.isSkipped && (
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
        />
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

      <CheckpointConfirmDialog
        pendingAction={ui.pendingAction}
        skipCost={access.skipCost}
        nextHintCost={hints.nextCost}
        onConfirm={actions.confirmPendingAction}
        onClose={actions.closeConfirm}
      />
    </div>
  );
}
