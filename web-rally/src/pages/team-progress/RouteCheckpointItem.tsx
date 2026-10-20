import React, { useState } from "react";
import { Lock, Sparkles, Check, SkipForward } from "lucide-react";
import { formatTime } from "@/utils/timeFormat";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";
import { cn } from "@/lib/utils";
import {
  checkpointArrivedAt,
  checkpointScoreFor,
  findCheckpointProgress,
} from "@/lib/checkpointProgress";
import { CheckpointDiscoveryModal } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import { useCheckpointArrival } from "./useCheckpointArrival";
import CheckpointArrivalAction from "./CheckpointArrivalAction";
import { useCheckpointArrivalAvailability } from "./useCheckpointArrivalAvailability";

type RouteCheckpointItemProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  index: number;
  team: DetailedTeam;
  /** Orders the server says this team has resolved (completed or given up). */
  resolvedOrders: ReadonlySet<number>;
  showScore: boolean;
  showMap: boolean;
  isExpanded: boolean;
  onToggle: (index: number) => void;
  /** Render a check-in button on this row (see the component's note). */
  offerCheckIn?: boolean;
  notYetDeparted?: string | null;
}>;

function statusDotContent(isCompleted: boolean, isSkipped: boolean, order: number) {
  if (isCompleted) return <Check className="h-4 w-4" />;
  if (isSkipped) return <SkipForward className="h-4 w-4" />;
  return order;
}

interface StatusDotProps {
  readonly order: number;
  readonly isCompleted: boolean;
  readonly isSkipped: boolean;
  readonly isCurrent: boolean;
  readonly isFuture: boolean;
}

function StatusDot({ order, isCompleted, isSkipped, isCurrent, isFuture }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "rally-num grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold",
        isCompleted && "rally-bg-accent text-white",
        isSkipped && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        isCurrent &&
          "rally-bg-accent text-white ring-4 ring-[var(--rally-accent-soft,var(--rally-accent-soft-fallback))]",
        isFuture && "border border-dashed border-border text-muted-foreground",
      )}
    >
      {statusDotContent(isCompleted, isSkipped, order)}
    </span>
  );
}

function checkpointStatusLabel(status: string, isCurrent: boolean): string {
  if (status === "skipped") return "Desistiu";
  if (status === "completed") return "Concluído";
  if (status === "arrived") return "Chegada registada";
  if (isCurrent) return "Em curso";
  return "Pendente";
}

export default function RouteCheckpointItem({
  checkpoint,
  team,
  resolvedOrders,
  showScore,
  showMap,
  offerCheckIn = false,
  notYetDeparted = null,
}: RouteCheckpointItemProps) {
  const order = checkpoint.order;
  // Both states come from the server's progress engine, which is the only
  // thing that knows the stage rules and the completion predicate. The old
  // `order <= completedCount` / `order === completedCount + 1` arithmetic
  // described a strictly sequential route only: under free order or stages a
  // team resolves posts out of sequence, so a post it had finished was
  // labelled "Pendente" and several genuinely open posts collapsed to one.
  const progress = findCheckpointProgress(team, checkpoint.id);
  // Older payloads can omit the keyed detail.  Their resolved-order set only
  // represented successful completion, so retain that compatibility fallback;
  // current payloads always use the explicit status (and can distinguish skip).
  const status = progress?.status ?? (resolvedOrders.has(order) ? "completed" : "pending");
  const isCompleted = status === "completed";
  const isSkipped = status === "skipped";
  const isResolved = resolvedOrders.has(order);
  const isCurrent = !isResolved && checkpoint.is_reachable === true;
  const isFuture = !isResolved && !isCurrent;
  const arrival = useCheckpointArrival(checkpoint);
  const availability = useCheckpointArrivalAvailability(checkpoint, progress, notYetDeparted);

  const checkpointScore = isCompleted ? checkpointScoreFor(team, checkpoint.id) : 0;
  // What the server actually revealed, not what the client guessed. A post the
  // team has arrived at is un-redacted even while its activity is unscored, and
  // the arithmetic version called that "future" — so the gallery request was
  // never even made for the post the team was standing at.
  const canReveal = checkpoint.is_redacted !== true;
  const { photos, funFacts } = useCheckpointMedia(checkpoint.id, canReveal);

  const [modalOpen, setModalOpen] = useState(false);

  const cover = photos[0];
  const hasDiscovery =
    canReveal && (photos.length > 0 || funFacts.length > 0 || !!checkpoint.description);

  const statusLabel = checkpointStatusLabel(status, isCurrent);

  const CardElement = (canReveal ? "button" : "div") as React.ElementType;
  const cardProps = canReveal
    ? {
        type: "button" as const,
        onClick: () => setModalOpen(true),
      }
    : {};

  const teamTime = checkpointArrivedAt(team, checkpoint.id);
  const thumb = canReveal ? cover?.image_url : null;

  return (
    <li className="list-none">
      <CardElement
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-normal transition-colors",
          canReveal && "cursor-pointer hover:bg-accent/40",
          isCurrent && "rally-bg-accent-soft",
        )}
        {...cardProps}
      >
        <StatusDot
          order={order}
          isCompleted={isCompleted}
          isSkipped={isSkipped}
          isCurrent={isCurrent}
          isFuture={isFuture}
        />

        <span className="min-w-0 flex-1">
          {/* Name only shown once revealable — the value itself is
              server-redacted, but printing a name over its own lock reads
              as a contradiction. */}
          {canReveal ? (
            <span
              className={cn(
                "block truncate text-sm font-semibold",
                isFuture ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {checkpoint.name}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Descobre este local quando lá chegares</span>
            </span>
          )}
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn(isCurrent && "rally-accent font-semibold")}>{statusLabel}</span>
            {hasDiscovery && (
              <span className="rally-accent inline-flex items-center gap-1 font-semibold">
                <Sparkles className="h-3 w-3" aria-hidden />
                <span className="sr-only">Toca para descobrir</span>
              </span>
            )}
          </span>
        </span>

        {thumb && (
          <img
            src={thumb}
            alt={cover?.caption ?? checkpoint.name}
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
          />
        )}

        {(showScore && isCompleted) || (isCompleted && teamTime) ? (
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            {showScore && isCompleted && (
              <span className="rally-num rally-accent text-sm font-bold">
                +{checkpointScore} pts
              </span>
            )}
            {isCompleted && teamTime && (
              <span className="rally-num text-[11px] text-muted-foreground">
                {formatTime(teamTime)}
              </span>
            )}
          </span>
        ) : null}
      </CardElement>

      {/* A second way in, for the posts the main card cannot offer. That card
          renders one post; a free-choice stage opens several, so without a
          button here the rest of the stage is unreachable for the team even
          though the server would take them. */}
      {offerCheckIn && (
        <div className="space-y-2 px-3 pb-2 pl-[3.75rem]">
          <CheckpointArrivalAction
            openingNotice={availability.openingNotice}
            settingsUnavailable={availability.settingsUnavailable}
            canCheckin={availability.canCheckin}
            gpsState={arrival.gpsState}
            gpsMsg={arrival.gpsMsg}
            isQueuedHere={arrival.isQueuedHere}
            isPending={arrival.isPending}
            onCheckin={arrival.handleCheckin}
            onClearError={arrival.clearError}
            onRetrySettings={() => void availability.refetchSettings()}
            // "aqui" points at this specific post instead of implying it's
            // the only option. A redacted checkpoint's name must never reach
            // an aria-label, so that case falls back to the generic wording.
            idleLabel="Check-in GPS aqui"
            ariaLabel={canReveal ? `Check-in GPS aqui, em ${checkpoint.name}` : undefined}
            bare
          />
        </div>
      )}

      <CheckpointDiscoveryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        checkpointId={checkpoint.id}
        name={checkpoint.name}
        description={checkpoint.description}
        // Defense in depth: the modal can in principle only ever open for a
        // revealable post (the card itself is a non-interactive div while
        // `!canReveal`), but coordinates still must not be handed to it for a
        // redacted one — one UI gate should not be the only thing standing
        // between a secret checkpoint and its location leaking.
        latitude={canReveal ? checkpoint.latitude : null}
        longitude={canReveal ? checkpoint.longitude : null}
        showMap={showMap}
        statusLabel={statusLabel}
      />
    </li>
  );
}
