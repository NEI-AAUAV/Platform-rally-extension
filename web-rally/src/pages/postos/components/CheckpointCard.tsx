import { MapPin, Navigation } from "lucide-react";

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

/**
 * One checkpoint in the route list: an accent-numbered, soft-depth row that
 * selects on click (driving the map) and offers a directions shortcut. The
 * selected state is marked with an accent ring + border.
 */
export default function CheckpointCard({
  checkpoint,
  isSelected,
  onSelect,
  showMap = true,
}: CheckpointCardProps) {
  const hasCoordinates = checkpoint.latitude && checkpoint.longitude;

  return (
    <button
      type="button"
      onClick={() => onSelect(checkpoint)}
      aria-pressed={isSelected}
      aria-label={`Selecionar posto ${checkpoint.name}`}
      className={[
        "rally-press w-full rounded-xl border bg-card p-4 text-left",
        isSelected
          ? "rally-border-accent rally-ring-accent"
          : "border-border hover:bg-accent/40",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold",
            isSelected ? "rally-bg-accent text-white" : "rally-bg-accent-soft rally-accent",
          ].join(" ")}
        >
          {checkpoint.order}
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="truncate font-semibold text-foreground">{checkpoint.name}</h4>
          {checkpoint.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {checkpoint.description}
            </p>
          )}
          {showMap && hasCoordinates && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {checkpoint.latitude?.toFixed(5)}, {checkpoint.longitude?.toFixed(5)}
            </p>
          )}
        </div>

        {showMap && hasCoordinates && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rally-press inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground"
          >
            <Navigation className="h-3.5 w-3.5" />
            Ir
          </a>
        )}
      </div>
    </button>
  );
}
