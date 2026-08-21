import React, { useState } from "react";
import { Lock, Camera, Sparkles, Check } from "lucide-react";
import { formatTime } from "@/utils/timeFormat";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";
import { cn } from "@/lib/utils";
import { CheckpointDiscoveryModal } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";
import { useCheckpointArrival } from "./useCheckpointArrival";

type RouteCheckpointItemProps = Readonly<{
  checkpoint: DetailedCheckPoint;
  index: number;
  team: DetailedTeam;
  completedCount: number;
  showScore: boolean;
  showMap: boolean;
  isExpanded: boolean;
  onToggle: (index: number) => void;
  isLast?: boolean;
  /** Render a check-in button on this row (see the component's note). */
  offerCheckIn?: boolean;
}>;

interface CheckpointTimelineDotProps {
  readonly order: number;
  readonly isCompleted: boolean;
  readonly isCurrent: boolean;
  readonly isFuture: boolean;
  readonly isLast: boolean;
}

function CheckpointTimelineDot({
  order,
  isCompleted,
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
          isCurrent && "rally-bg-accent text-white",
          isFuture && "bg-secondary text-muted-foreground",
        )}
      >
        {isCompleted ? <Check className="h-4 w-4" /> : order}
      </div>
      {!isLast && (
        <div
          className={cn("mt-1 w-0.5 flex-1", isCompleted ? "rally-bg-accent" : "bg-border")}
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
  completedCount,
  showScore,
  showMap,
  isLast = false,
  offerCheckIn = false,
}: RouteCheckpointItemProps) {
  const order = checkpoint.order;
  const isCompleted = order <= completedCount;
  // `is_reachable` comes from the server, which is the only thing that knows
  // the stage rules — a free-choice stage has several posts open at once, and
  // the positional guess below can only ever name one. Kept as the fallback
  // for a payload that predates the field.
  const isCurrent = checkpoint.is_reachable ?? order === completedCount + 1;
  const isFuture = !isCompleted && !isCurrent;
  const arrival = useCheckpointArrival(checkpoint);

  const checkpointScore = isCompleted ? (team.score_per_checkpoint?.[order - 1] ?? 0) : 0;
  const canReveal = isCompleted || isCurrent;
  const { photos, funFacts } = useCheckpointMedia(checkpoint.id, canReveal);

  const [modalOpen, setModalOpen] = useState(false);

  const cover = photos[0];
  const hasDiscovery =
    canReveal && (photos.length > 0 || funFacts.length > 0 || !!checkpoint.description);

  let statusLabel = "Pendente";
  if (isCompleted) {
    statusLabel = "Concluído";
  } else if (isCurrent) {
    statusLabel = "Em curso";
  }

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
            isCurrent={isCurrent}
            isFuture={isFuture}
            canReveal={canReveal}
            statusLabel={statusLabel}
            description={checkpoint.description}
            hasDiscovery={hasDiscovery}
            showScore={showScore}
            checkpointScore={checkpointScore}
            teamTime={team.times[order - 1]}
          />
        </CardElement>

        {/* A second way in, for the posts the main card cannot offer. That card
            renders one post; a free-choice stage opens several, so without a
            button here the rest of the stage is unreachable for the team even
            though the server would take them. */}
        {offerCheckIn && (
          <div className="mt-2 space-y-1.5">
            <button
              type="button"
              disabled={
                arrival.gpsState === "locating" || arrival.isPending || arrival.gpsState === "done"
              }
              onClick={arrival.handleCheckin}
              className="rally-press w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition-all hover:bg-accent/40 disabled:opacity-60"
            >
              {arrival.gpsState === "done" ? "Check-in feito" : "Check-in GPS aqui"}
            </button>
            {arrival.gpsMsg && (
              <p className="text-center text-xs text-muted-foreground">{arrival.gpsMsg}</p>
            )}
          </div>
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
