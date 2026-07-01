import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigation, Images } from "lucide-react";
import { CheckpointMediaService, type CheckpointMediaResponse } from "@/client";

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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: media = [] } = useQuery<CheckpointMediaResponse[]>({
    queryKey: ["checkpoint-media", checkpoint.id],
    queryFn: () =>
      CheckpointMediaService.listCheckpointMediaApiRallyV1CheckpointCheckpointIdMediaGet(
        checkpoint.id,
      ),
    enabled: galleryOpen,
    staleTime: 60_000,
  });

  const images = media.filter((m) => m.image_url);

  return (
    <article
      className={[
        "rounded-[16px] border transition-colors",
        isSelected ? "rally-border-accent bg-card" : "border-border bg-card hover:border-muted-foreground/30",
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
          {checkpoint.description && (
            <p className="mt-[2px] line-clamp-1 text-[12.5px] text-muted-foreground">
              {checkpoint.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setGalleryOpen((v) => !v)}
            title="Galeria de fotos"
            aria-pressed={galleryOpen}
            className={[
              "inline-flex items-center gap-1.5 rounded-[11px] border px-3 py-2 text-xs font-bold transition-colors",
              galleryOpen
                ? "rally-border-accent rally-accent bg-card"
                : "border-border bg-background text-foreground hover:bg-muted/40",
            ].join(" ")}
          >
            <Images className="h-3.5 w-3.5" />
          </button>
          {showMap && hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[11px] border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted/40"
            >
              <Navigation className="h-3.5 w-3.5" />
              Ir
            </a>
          )}
        </div>
      </div>

      {galleryOpen && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {images.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem fotos disponíveis.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {images
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLightbox(item.image_url!)}
                    className="shrink-0 overflow-hidden rounded-lg ring-1 ring-border transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <img
                      src={item.image_url!}
                      alt={item.caption ?? `Foto ${item.id}`}
                      className="h-20 w-20 object-cover sm:h-24 sm:w-24"
                      loading="lazy"
                    />
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Ampliado"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </article>
  );
}
