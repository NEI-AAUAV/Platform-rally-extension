import React, { useState } from "react";
import { Lock, Camera, Sparkles, Check, SkipForward } from "lucide-react";
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
  isLast?: boolean;
  /** Render a check-in button on this row (see the component's note). */
  offerCheckIn?: boolean;
  notYetDeparted?: string | null;
}>;

interface CheckpointTimelineDotProps {
  readonly order: number;
  readonly isCompleted: boolean;
  readonly isSkipped: boolean;
  readonly isCurrent: boolean;
  readonly isFuture: boolean;
  readonly isLast: boolean;
}

function CheckpointTimelineDot({
  order,
  isCompleted,
  isSkipped,
  isCurrent,
  isFuture,
  isLast,
}: CheckpointTimelineDotProps) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "rally-display relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          isCompleted && "rally-bg-accent text-white",
          isSkipped && "bg-amber-500/15 text-amber-700",
          isCurrent && "rally-bg-accent text-white",
          isFuture && "bg-secondary text-muted-foreground",
        )}
      >
        {isCompleted ? (
          <Check className="h-4 w-4" />
        ) : isSkipped ? (
          <SkipForward className="h-4 w-4" />
        ) : (
          order
        )}
      </div>
      {!isLast && (
        <div
          className={cn(
            "mt-1 w-0.5 flex-1",
            isCompleted || isSkipped ? "rally-bg-accent" : "bg-border",
          )}
          style={{ minHeight: "28px" }}
        />
      )}
    </div>
  );
}

interface CheckpointCardHeaderProps {
  readonly checkpointName: string;
  readonly coverUrl: string;
  readonly coverCaption?: string | null;
  readonly totalPhotos: number;
}

function CheckpointCardHeader({
  checkpointName,
  coverUrl,
  coverCaption,
  totalPhotos,
}: CheckpointCardHeaderProps) {
  return (
    <div className="relative h-36 w-full overflow-hidden sm:h-44">
      <img
        src={coverUrl}
        alt={coverCaption ?? checkpointName}
        className="h-full w-full object-cover transition duration-500 hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <span className="rally-display text-lg font-bold text-white drop-shadow">
          {checkpointName}
        </span>
        {totalPhotos > 1 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
            <Camera className="h-3 w-3" />
            {totalPhotos}
          </span>
        )}
      </div>
    </div>
  );
}

interface CheckpointCardBodyProps {
  readonly checkpointName: string;
  readonly hasCover: boolean;
  readonly isCompleted: boolean;
  readonly isSkipped: boolean;
  readonly isCurrent: boolean;
  readonly isFuture: boolean;
  readonly canReveal: boolean;
  readonly statusLabel: string;
  readonly description?: string | null;
  readonly hasDiscovery: boolean;
  readonly showScore: boolean;
  readonly checkpointScore: number;
  readonly teamTime?: string | null;
}

function CheckpointCardBody({
  checkpointName,
  hasCover,
  isCompleted,
  isSkipped,
  isCurrent,
  isFuture,
  canReveal,
  statusLabel,
  description,
  hasDiscovery,
  showScore,
  checkpointScore,
  teamTime,
}: CheckpointCardBodyProps) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Name only shown once revealable — the lock message below
                already covers unreached posts, and printing the name over
                its own lock is confusing even though the value itself is
                server-redacted. */}
            {!hasCover && canReveal && (
              <span
                className={cn(
                  "text-base font-bold",
                  isFuture ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {checkpointName}
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                isCompleted && "rally-bg-accent-soft text-foreground",
                isSkipped && "bg-amber-500/15 text-amber-800",
                isCurrent && "rally-bg-accent text-white",
                isFuture && "bg-secondary text-muted-foreground",
              )}
            >
              {statusLabel}
            </span>
          </div>

          {isFuture ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Descobre este local quando lá chegares
            </p>
          ) : (
            <>
              {description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
              )}
              {hasDiscovery && (
                <p className="rally-accent mt-2 inline-flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5" />
                  Toca para descobrir
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {showScore && isCompleted && (
            <span className="rally-display rally-accent text-sm font-bold tabular-nums">
              +{checkpointScore} pts
            </span>
          )}
          {isCompleted && teamTime && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatTime(teamTime)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RouteCheckpointItem({
  checkpoint,
  team,
  resolvedOrders,
  showScore,
  showMap,
  isLast = false,
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

  const statusLabel =
    status === "skipped"
      ? "Desistiu"
      : status === "completed"
        ? "Concluído"
        : status === "arrived"
          ? "Chegada registada"
          : isCurrent
            ? "Em curso"
            : "Pendente";

  const CardElement = (canReveal ? "button" : "div") as React.ElementType;
  const cardProps = canReveal
    ? {
        type: "button" as const,
        onClick: () => setModalOpen(true),
      }
    : {};

  return (
    <div className="flex gap-4">
      <CheckpointTimelineDot
        order={order}
        isCompleted={isCompleted}
        isSkipped={isSkipped}
        isCurrent={isCurrent}
        isFuture={isFuture}
        isLast={isLast}
      />

      <div className="flex-1 pb-5">
        <CardElement
          className={cn(
            "block w-full overflow-hidden rounded-2xl border text-left font-normal transition-all",
            isCompleted &&
              "cursor-pointer border-border bg-card hover:border-muted-foreground/30 hover:shadow-md",
            isCurrent && "rally-border-accent rally-bg-accent-soft cursor-pointer hover:shadow-md",
            isFuture && "border-border bg-card opacity-70",
          )}
          {...cardProps}
        >
          {canReveal && cover && (
            <CheckpointCardHeader
              checkpointName={checkpoint.name}
              coverUrl={cover.image_url!}
              coverCaption={cover.caption}
              totalPhotos={photos.length}
            />
          )}

          <CheckpointCardBody
            checkpointName={checkpoint.name}
            hasCover={!!(canReveal && cover)}
            isCompleted={isCompleted}
            isSkipped={isSkipped}
            isCurrent={isCurrent}
            isFuture={isFuture}
            canReveal={canReveal}
            statusLabel={statusLabel}
            description={checkpoint.description}
            hasDiscovery={hasDiscovery}
            showScore={showScore}
            checkpointScore={checkpointScore}
            teamTime={checkpointArrivedAt(team, checkpoint.id)}
          />
        </CardElement>

        {/* A second way in, for the posts the main card cannot offer. That card
            renders one post; a free-choice stage opens several, so without a
            button here the rest of the stage is unreachable for the team even
            though the server would take them. */}
        {offerCheckIn && (
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
          />
        )}
      </div>

      <CheckpointDiscoveryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        checkpointId={checkpoint.id}
        name={checkpoint.name}
        description={checkpoint.description}
        latitude={checkpoint.latitude}
        longitude={checkpoint.longitude}
        showMap={showMap}
        statusLabel={statusLabel}
      />
    </div>
  );
}
