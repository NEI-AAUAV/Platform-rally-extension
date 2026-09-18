import { useState } from "react";
import type { CheckpointProgress, DetailedCheckPoint } from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
import useEventTerms from "@/hooks/useEventTerms";
import useCheckpointHints from "@/hooks/useCheckpointHints";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import { useCheckpointArrival, type GpsState } from "./useCheckpointArrival";
import { useCheckpointArrivalAvailability } from "./useCheckpointArrivalAvailability";

/**
 * View model for NextCheckpointCard: adapts backend/settings data into the
 * flags and actions its subcomponents render, without owning domain rules.
 *
 * Three kinds of state stay explicit and separate here, on purpose:
 *  - persistent progress (`CheckpointProgress.status` on the team, owned by
 *    the backend — this hook doesn't compute or hold it, only the pieces
 *    that decide what's currently *offered* for this checkpoint);
 *  - access/gating (`access` below) — derived from settings + checkpoint +
 *    opening hours, all backend data; this hook adapts it for rendering but
 *    does not invent authorization. The arrival endpoint (useCheckpointArrival)
 *    independently re-validates every attempt server-side (see its "too_far"/
 *    "not_open" handling) — the flags here only gate the UI early so a team
 *    doesn't tap a button that would inevitably fail. They are not a
 *    substitute for that server-side check and must never become one.
 *  - transient UI/action state (`ui` below) — gpsState, the confirm dialog —
 *    genuinely local, describes the current HTTP/GPS operation, not the
 *    rally's domain.
 *
 * A backend-computed "interaction" capability block (allowed/blocked_reason
 * per action) was considered and deliberately deferred: every gate below is
 * already independently re-validated server-side, so centralizing it would
 * be a wire-protocol change for no closed security gap — see the refactor
 * plan. Revisit only if a second client needs the same gating logic or it
 * grows too complex to keep in sync here.
 */
export function useNextCheckpointState(
  checkpoint: DetailedCheckPoint,
  checkpointProgress?: CheckpointProgress,
) {
  const { settings } = useRallySettings();
  const terms = useEventTerms();
  const feminino = terms.checkpointGender === "f";

  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const isRedacted = checkpoint.is_redacted === true;

  const arrival = useCheckpointArrival(checkpoint);
  const hints = useCheckpointHints(checkpoint.id);
  const { photos, funFacts } = useCheckpointMedia(checkpoint.id);

  const arrivalAvailability = useCheckpointArrivalAvailability(checkpoint, checkpointProgress);

  const hasHintLadder = hints.revealed.length > 0 || hints.remaining > 0;
  const totalSpent = hints.revealed.reduce((sum, item) => sum + item.cost, 0);
  const hintCostLabel = hints.nextCost === 0 ? "" : ` (${hints.nextCost} pts)`;

  // "Spent" has to mean the team actually climbed the ladder, not that the
  // mechanic is off (which also reports remaining: 0). See canGiveUp's own
  // history in NextCheckpointCard before this extraction for why.
  const skipCost = settings?.skip_penalty ?? 0;
  const hintsOff = settings?.hints_enabled === false;
  const hintLadderSpent = hintsOff || (hasHintLadder && hints.remaining === 0);
  const canGiveUp =
    !arrivalAvailability.terminal &&
    settings?.skip_enabled !== false &&
    isRedacted &&
    hintLadderSpent;

  const proximityEnabled =
    !arrivalAvailability.terminal && isRedacted && settings?.proximity_enabled === true;
  const status = arrivalAvailability.status;

  const discoveryDescription =
    checkpoint.description && checkpoint.description === checkpoint.clue
      ? null
      : checkpoint.description;
  const hasDiscovery = photos.length > 0 || funFacts.length > 0 || !!discoveryDescription;

  // Both hint and give-up spend points, so each goes through an in-app
  // confirmation instead of the browser's confirm().
  const [pendingAction, setPendingAction] = useState<null | "hint" | "giveUp">(null);
  const closeConfirm = () => setPendingAction(null);
  const confirmPendingAction = () => {
    if (pendingAction === "hint") hints.reveal.mutate();
    else if (pendingAction === "giveUp") hints.giveUp.mutate();
    setPendingAction(null);
  };
  const requestHint = () => {
    // Points are spent here, so never on a stray tap — a free hint skips the prompt.
    if (hints.nextCost === 0) hints.reveal.mutate();
    else setPendingAction("hint");
  };
  const requestGiveUp = () => setPendingAction("giveUp");

  return {
    hasCoords,
    isRedacted,
    feminino,
    persistent: {
      status,
      hasArrived: status === "arrived" || status === "completed",
      isCompleted: status === "completed",
      isSkipped: status === "skipped",
    },
    access: {
      canCheckin: arrivalAvailability.canCheckin,
      openingNotice: arrivalAvailability.openingNotice,
      settingsUnavailable: arrivalAvailability.settingsUnavailable,
      canGiveUp,
      hasHintLadder,
      proximityEnabled,
      hasDiscovery,
      skipCost,
      hintCostLabel,
      totalSpent,
      discoveryDescription,
    },
    ui: {
      gpsState: arrival.gpsState as GpsState,
      gpsMsg: arrival.gpsMsg,
      isQueuedHere: arrival.isQueuedHere,
      isPending: arrival.isPending,
      pendingAction,
    },
    hints,
    actions: {
      handleCheckin: arrival.handleCheckin,
      clearError: arrival.clearError,
      refetchSettings: arrivalAvailability.refetchSettings,
      requestHint,
      requestGiveUp,
      confirmPendingAction,
      closeConfirm,
    },
  };
}

export type NextCheckpointState = ReturnType<typeof useNextCheckpointState>;
