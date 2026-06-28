import { Navigation } from "lucide-react";

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

  return (
    <button
      type="button"
      onClick={() => onSelect(checkpoint)}
      aria-pressed={isSelected}
      aria-label={`Selecionar posto ${checkpoint.name}`}
      className={[
        "flex w-full items-center gap-4 rounded-[16px] border p-[16px_18px] text-left transition-colors",
        isSelected
          ? "rally-border-accent bg-card"
          : "border-border bg-card hover:border-muted-foreground/30",
      ].join(" ")}
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
        {checkpoint.description && (
          <p className="mt-[2px] line-clamp-1 text-[12.5px] text-muted-foreground">
            {checkpoint.description}
          </p>
        )}
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
    </button>
  );
}
