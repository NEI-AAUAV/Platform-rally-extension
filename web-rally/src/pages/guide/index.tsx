import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import {
  BookOpen,
  MapPin,
  ChevronDown,
  ChevronUp,
  Image,
  Lightbulb,
  Compass,
  HelpCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  listGuideCheckpoints,
  type GuideCheckpointResponse,
  type GuideMediaItem,
  type GuideIndicationItem,
} from "@/client";
import { LoadingState } from "@/components/shared";
import useGuideAccess from "@/hooks/useGuideAccess";
import { useBackDismiss } from "@/hooks/useBackDismiss";

function MediaGallery({ media }: Readonly<{ media: readonly GuideMediaItem[] }>) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Back closes the zoomed image, the way a native gallery behaves.
  useBackDismiss(
    lightbox !== null,
    useCallback(() => setLightbox(null), []),
  );

  const photos = media.filter((m) => m.kind === "photo" && m.url);
  const funFacts = media.filter((m) => m.kind === "fun_fact");

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
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightbox(item.url ?? null)}
                className="rally-press shrink-0 overflow-hidden rounded-lg ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <img
                  src={item.url ?? undefined}
                  alt={item.caption ?? `Foto ${item.id}`}
                  className="h-24 w-24 object-cover sm:h-32 sm:w-32"
                  loading="lazy"
                />
              </button>
            ))}
        </div>
      )}

      {funFacts.length > 0 && (
        <ul className="space-y-1.5">
          {funFacts
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-foreground"
              >
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>{item.caption}</span>
              </li>
            ))}
        </ul>
      )}

      {lightbox && (
        <button
          type="button"
          aria-label="Fechar imagem ampliada"
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightbox(null);
          }}
        >
          <img
            src={lightbox}
            alt="Ampliado"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          />
        </button>
      )}
    </>
  );
}

function IndicationList({
  indications,
}: Readonly<{ indications: readonly GuideIndicationItem[] }>) {
  if (indications.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="rally-accent flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]">
        <Compass className="h-3.5 w-3.5" /> Indicações do guia
      </p>
      <ol className="space-y-2">
        {indications
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((ind) => (
            <li key={ind.id} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-semibold leading-snug text-foreground">{ind.hint}</p>
              {ind.question && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{ind.question}</span>
                </p>
              )}
              {ind.expected_answer && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>{ind.expected_answer}</span>
                </p>
              )}
            </li>
          ))}
      </ol>
    </section>
  );
}

function CheckpointCard({ cp }: Readonly<{ cp: GuideCheckpointResponse }>) {
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
          {cp.latitude != null && cp.longitude != null && (
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
          {cp.description && <p className="text-sm text-muted-foreground">{cp.description}</p>}
          {cp.clue && (
            <section className="rounded-xl border border-dashed border-border bg-muted/40 p-3">
              <p className="rally-accent mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]">
                <Sparkles className="h-3.5 w-3.5" /> Enigma dado à equipa
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {cp.clue}
              </p>
              {cp.clue_media_url && (
                <img
                  src={cp.clue_media_url}
                  alt="Pista visual do enigma"
                  loading="lazy"
                  className="mt-2 max-h-48 w-full rounded-lg object-cover"
                />
              )}
            </section>
          )}
          <IndicationList indications={cp.indications} />
          <MediaGallery media={cp.media} />
        </div>
      )}
    </article>
  );
}

export default function GuidePage() {
  const { isAllowed, isLoading: accessLoading } = useGuideAccess();

  const { data: checkpoints = [], isLoading } = useQuery<GuideCheckpointResponse[]>({
    queryKey: ["guide-checkpoints"],
    queryFn: async () => (await listGuideCheckpoints()).data,
    enabled: isAllowed,
  });

  if (accessLoading) return <LoadingState message="A carregar…" />;
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
