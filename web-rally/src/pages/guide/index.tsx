import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { BookOpen, MapPin, ChevronDown, ChevronUp, Image } from "lucide-react";
import { GuideService, type GuideCheckpointResponse, type GuideMediaItem } from "@/client";
import { useUserStore } from "@/stores/useUserStore";
import { LoadingState } from "@/components/shared";

function MediaGallery({ media }: { media: GuideMediaItem[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (media.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Image className="h-3.5 w-3.5" />
        Sem media disponível
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {media
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLightbox(item.url)}
              className="rally-press shrink-0 overflow-hidden rounded-lg ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {item.kind === "image" ? (
                <img
                  src={item.url}
                  alt={item.caption ?? `Media ${item.id}`}
                  className="h-24 w-24 object-cover sm:h-32 sm:w-32"
                  loading="lazy"
                />
              ) : (
                <video
                  src={item.url}
                  className="h-24 w-24 object-cover sm:h-32 sm:w-32"
                  muted
                  preload="metadata"
                />
              )}
            </button>
          ))}
      </div>

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
    </>
  );
}

function CheckpointCard({ cp }: { cp: GuideCheckpointResponse }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rally-surface overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-accent/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {cp.order}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{cp.name}</p>
          {cp.latitude && cp.longitude && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}
            </p>
          )}
        </div>
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t px-4 pb-4 pt-3">
          {cp.description && (
            <p className="text-sm text-muted-foreground">{cp.description}</p>
          )}
          <MediaGallery media={cp.media} />
        </div>
      )}
    </article>
  );
}

export default function GuidePage() {
  const scopes = useUserStore((s) => s.scopes);
  const sessionLoading = useUserStore((s) => s.sessionLoading);

  const isAllowed =
    scopes?.includes("rally-guide") ||
    scopes?.includes("rally-staff") ||
    scopes?.includes("admin") ||
    scopes?.includes("manager-rally") ||
    scopes?.includes("rally:admin");

  const { data: checkpoints = [], isLoading } = useQuery<GuideCheckpointResponse[]>({
    queryKey: ["guide-checkpoints"],
    queryFn: () => GuideService.listGuideCheckpointsApiRallyV1GuideCheckpointsGet(),
    enabled: !!isAllowed,
  });

  if (sessionLoading) return <LoadingState message="A carregar…" />;
  if (!isAllowed) return <Navigate to="/" replace />;
  if (isLoading) return <LoadingState message="A carregar postos do guia…" />;

  return (
    <div className="space-y-8">
      <header>
        <p className="rally-accent inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em]">
          <BookOpen className="h-3.5 w-3.5" /> Guia turístico
        </p>
        <h1 className="rally-display mt-2 text-4xl font-bold text-foreground sm:text-5xl">
          Postos — Visão do Guia
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Informação detalhada e galeria de media de cada posto para uso interno dos guias.
        </p>
      </header>

      {checkpoints.length === 0 ? (
        <div className="rally-surface flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold text-muted-foreground">Sem postos disponíveis</p>
        </div>
      ) : (
        <div className="space-y-3">
          {checkpoints.map((cp) => (
            <CheckpointCard key={cp.id} cp={cp} />
          ))}
        </div>
      )}
    </div>
  );
}
