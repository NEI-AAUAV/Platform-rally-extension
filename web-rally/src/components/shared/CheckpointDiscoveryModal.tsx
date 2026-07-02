import { useEffect } from "react";
import { X, MapPin, Navigation } from "lucide-react";
import CheckpointDiscovery from "./CheckpointDiscovery";

type CheckpointDiscoveryModalProps = Readonly<{
  open: boolean;
  onClose: () => void;
  checkpointId: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  showMap?: boolean;
  /** Small status pill (e.g. "Concluído", "Em curso"). */
  statusLabel?: string;
}>;

/**
 * Full-screen "discover the place" modal for a checkpoint: big hero photos,
 * fun facts, description, directions. Dependency-free overlay (no radix) with
 * Escape-to-close and body scroll lock.
 */
export default function CheckpointDiscoveryModal({
  open,
  onClose,
  checkpointId,
  name,
  description,
  latitude,
  longitude,
  showMap = true,
  statusLabel,
}: CheckpointDiscoveryModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const hasCoords = latitude != null && longitude != null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Descobrir ${name}`}
    >
      <div
        className="animate-in slide-in-from-bottom-4 fade-in max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card shadow-2xl duration-300 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="rally-accent h-4 w-4 shrink-0" />
              <h2 className="rally-display truncate text-lg font-bold text-foreground">{name}</h2>
            </div>
            {statusLabel && (
              <span className="rally-bg-accent-soft rally-accent mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {statusLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <CheckpointDiscovery checkpointId={checkpointId} description={description} />

          {showMap && hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rally-bg-accent mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              <Navigation className="h-4 w-4" />
              Como chegar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
