import { Navigation, Compass } from "lucide-react";
import { CheckpointDiscovery } from "@/components/shared";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

type CheckpointCardProps = Readonly<{
  checkpoint: Checkpoint;
  isSelected: boolean;
  onSelect: (checkpoint: Checkpoint) => void;
  showMap?: boolean;
}>;

export default function CheckpointCard({
  checkpoint,
  isSelected,
  onSelect,
  showMap = true,
}: CheckpointCardProps) {
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const { photos, funFacts } = useCheckpointMedia(checkpoint.id);
  const hasDiscovery = !!checkpoint.description || photos.length > 0 || funFacts.length > 0;

  return (
    <article
      className={[
        "overflow-hidden rounded-[16px] border transition-colors",
        isSelected
          ? "rally-border-accent bg-card"
          : "border-border bg-card hover:border-muted-foreground/30",
      ].join(" ")}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(checkpoint)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(checkpoint);
          }
        }}
        aria-pressed={isSelected}
        aria-label={`Selecionar posto ${checkpoint.name}`}
        className="flex w-full cursor-pointer items-center gap-4 p-[16px_18px] text-left"
      >
        <span
          className={[
            "rally-display grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[13px] text-[20px] font-bold",
            isSelected ? "rally-bg-accent text-white" : "bg-muted/60 text-muted-foreground",
          ].join(" ")}
        >
          {checkpoint.order}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-[16px] text-foreground">{checkpoint.name}</p>
          <p className="mt-[3px] flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            <Compass className="h-3.5 w-3.5" />
            Descobre este local
          </p>
        </div>
        {showMap && hasCoords && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[11px] border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted/40"
          >
            <Navigation className="h-3.5 w-3.5" />
            Ir
          </a>
        )}
      </div>

      {hasDiscovery && (
        <div className="border-t border-border px-[18px] pb-4 pt-3">
          <CheckpointDiscovery checkpointId={checkpoint.id} description={checkpoint.description} />
        </div>
      )}
    </article>
  );
}
