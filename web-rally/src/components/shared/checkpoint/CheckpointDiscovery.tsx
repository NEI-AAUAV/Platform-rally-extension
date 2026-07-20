import { useState } from "react";
import { Lightbulb, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCheckpointMedia } from "@/hooks/useCheckpointMedia";

type CheckpointDiscoveryProps = Readonly<{
  checkpointId: number;
  /** Full place description, shown above the media. */
  description?: string | null;
  /** Defer network fetch until the card is actually visible/expanded. */
  enabled?: boolean;
  /** Compact variant for dense timelines (smaller thumbs, tighter spacing). */
  compact?: boolean;
  /** Optional "Descobre o local" heading, hidden automatically when empty. */
  heading?: string;
  /** Extra classes on the outer container (only rendered when there is content). */
  className?: string;
}>;

/**
 * "Discover the place" block: full description + site photos + fun facts.
 * Shared by the public postos cards and the team checkpoint timeline so both
 * give teams the same rich sense of each location.
 */
export default function CheckpointDiscovery({
  checkpointId,
  description,
  enabled = true,
  compact = false,
  heading,
  className,
}: CheckpointDiscoveryProps) {
  const { photos, funFacts } = useCheckpointMedia(checkpointId, enabled);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const hasContent = !!description || photos.length > 0 || funFacts.length > 0;
  if (!hasContent) return null;

  const thumb = compact ? "h-20 w-28" : "h-28 w-40 sm:h-32 sm:w-48";

  return (
    <div className={cn(compact ? "space-y-3" : "space-y-4", className)}>
      {heading && (
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
          <Compass className="h-3.5 w-3.5" />
          {heading}
        </div>
      )}
      {description && (
        <p
          className={
            compact
              ? "text-sm text-foreground/90"
              : "text-[15px] leading-relaxed text-foreground/90"
          }
        >
          {description}
        </p>
      )}

      {photos.length > 0 && (
        <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setLightbox(p.image_url!)}
              className={`group relative shrink-0 snap-start overflow-hidden rounded-xl ring-1 ring-border transition hover:ring-2 hover:ring-primary focus:outline-none focus:ring-2 focus:ring-primary ${thumb}`}
            >
              <img
                src={p.image_url!}
                alt={p.caption ?? "Foto do local"}
                className="h-full w-full object-cover transition group-hover:scale-105"
                loading="lazy"
              />
              {p.caption && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-left text-[11px] font-medium text-white">
                  {p.caption}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {funFacts.length > 0 && (
        <ul className="space-y-2">
          {funFacts.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950/25 dark:text-amber-200"
            >
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{f.caption}</span>
            </li>
          ))}
        </ul>
      )}

      {lightbox && (
        <dialog
          open
          className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center bg-black/85 p-4"
          aria-label="Foto ampliada"
          onClose={() => setLightbox(null)}
          onCancel={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-transparent"
            onClick={() => setLightbox(null)}
            aria-label="Fechar ampliação"
          />
          <div className="relative z-10">
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute right-4 top-4 z-20 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Fechar"
            >
              ✕
            </button>
            <img
              src={lightbox}
              alt="Ampliada"
              className="relative z-10 max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </dialog>
      )}
    </div>
  );
}
