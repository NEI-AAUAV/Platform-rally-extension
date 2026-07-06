import { useState } from "react";
import { Lock, Camera, Sparkles } from "lucide-react";
import { formatTime } from "@/utils/timeFormat";
import type { DetailedTeam, DetailedCheckPoint } from "@/client";
import { cn } from "@/lib/utils";
import { CheckpointDiscoveryModal } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";

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
}>;

export default function RouteCheckpointItem({
  checkpoint,
  team,
  completedCount,
  showScore,
  showMap,
  isLast = false,
}: RouteCheckpointItemProps) {
  const order = checkpoint.order;
  const isCompleted = order <= completedCount;
  const isCurrent = order === completedCount + 1;
  const isFuture = order > completedCount + 1;

  const checkpointScore = isCompleted ? (team.score_per_checkpoint?.[order - 1] ?? 0) : 0;
  // Only reveal place content once the team has reached (or is at) the checkpoint,
  // so future stops stay a surprise to discover on arrival.
  const canReveal = isCompleted || isCurrent;
  const { photos, funFacts } = useCheckpointMedia(checkpoint.id, canReveal);

  const [modalOpen, setModalOpen] = useState(false);

  const cover = photos[0];
  const hasDiscovery =
    canReveal && (photos.length > 0 || funFacts.length > 0 || !!checkpoint.description);
  const statusLabel = isCompleted ? "Concluído" : isCurrent ? "Em curso" : "Pendente";

  return (
    <div className="flex gap-4">
      {/* dot + connector line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "rally-display relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            isCompleted && "rally-bg-accent text-white",
            isCurrent && "rally-bg-accent text-white",
            isFuture && "bg-secondary text-muted-foreground",
          )}
        >
          {isCompleted ? "✓" : order}
        </div>
        {!isLast && (
          <div
            className={cn("mt-1 w-0.5 flex-1", isCompleted ? "rally-bg-accent" : "bg-border")}
            style={{ minHeight: "28px" }}
          />
        )}
      </div>

      {/* card */}
      <div className="flex-1 pb-5">
        <div
          role={canReveal ? "button" : undefined}
          tabIndex={canReveal ? 0 : undefined}
          onClick={canReveal ? () => setModalOpen(true) : undefined}
          onKeyDown={
            canReveal
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setModalOpen(true);
                  }
                }
              : undefined
          }
          className={cn(
            "overflow-hidden rounded-2xl border transition-all",
            isCompleted &&
              "cursor-pointer border-border bg-card hover:border-muted-foreground/30 hover:shadow-md",
            isCurrent && "rally-border-accent rally-bg-accent-soft cursor-pointer hover:shadow-md",
            isFuture && "border-border bg-card opacity-70",
          )}
        >
          {/* Cover photo (revealed checkpoints only) */}
          {canReveal && cover && (
            <div className="relative h-36 w-full overflow-hidden sm:h-44">
              <img
                src={cover.image_url!}
                alt={cover.caption ?? checkpoint.name}
                className="h-full w-full object-cover transition duration-500 hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                <span className="rally-display text-lg font-bold text-white drop-shadow">
                  {checkpoint.name}
                </span>
                {photos.length > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
                    <Camera className="h-3 w-3" />
                    {photos.length}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* When there's a cover photo the name is already in the hero */}
                  {!(canReveal && cover) && (
                    <span
                      className={cn(
                        "text-base font-bold",
                        isFuture ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {checkpoint.name}
                    </span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      isCompleted && "rally-bg-accent-soft rally-accent",
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
                    {checkpoint.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {checkpoint.description}
                      </p>
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
                {isCompleted && team.times[order - 1] && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatTime(team.times[order - 1])}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
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
