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
  Megaphone,
  Flag,
  Map as MapIcon,
  Users,
} from "lucide-react";
import CheckpointTeamsPanel from "./CheckpointTeamsPanel";
import GuideTeamPanel from "./GuideTeamPanel";
import {
  listGuideCheckpoints,
  type GuideCheckpointResponse,
  type GuideMediaItem,
  type GuideIndicationItem,
} from "@/client";
import { LoadingState } from "@/components/shared";
import useGuideAccess from "@/hooks/useGuideAccess";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import MapSection from "@/pages/checkpoints/components/MapSection";

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
  purchasedIds = [],
}: Readonly<{
  indications: readonly GuideIndicationItem[];
  /** Indication ids some team already unlocked in the app, for points. */
  purchasedIds?: readonly number[];
}>) {
  if (indications.length === 0) return null;
  const purchased = new Set(purchasedIds);

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
              {purchased.has(ind.id) && (
                // Already paid for in the app. Reading it out again hands back,
                // for free, what the team spent points on.
                <p className="mb-1 text-xs font-semibold text-amber-600">
                  Já comprada por uma equipa
                </p>
              )}
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
  // The current post opens by default — it's the one the guide's team is
  // actually working on right now.
  const [open, setOpen] = useState(cp.is_current);
  // Which indications teams at this post already unlocked, surfaced from the
  // teams panel so the ladder above can flag them.
  const [purchasedIds, setPurchasedIds] = useState<readonly number[]>([]);

  return (
    <article
      className={`rally-surface overflow-hidden ${cp.is_current ? "ring-2 ring-primary" : ""}`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-accent/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            cp.is_current ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          {cp.order}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold leading-tight">{cp.name}</p>
            {cp.is_current && (
              <span className="rally-accent shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Atual
              </span>
            )}
          </div>
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
          {/* The two planning columns, for the person actually standing here.
              Kept above the paid hint ladder: this is what to say, not what
              the team has to buy. */}
          {cp.staff_script && (
            <section className="rounded-xl border border-border bg-card/60 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Megaphone className="h-3.5 w-3.5" /> Assuntos a abordar
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed">{cp.staff_script}</p>
            </section>
          )}
          {cp.challenge_brief && (
            <section className="rounded-xl border border-border bg-card/60 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Flag className="h-3.5 w-3.5" /> Desafio
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed">{cp.challenge_brief}</p>
            </section>
          )}
          <IndicationList indications={cp.indications} purchasedIds={purchasedIds} />
          {/* Only the current post is writable server-side (see
              GuideService.can_manage_checkpoint) — other posts would just
              403 on both the teams list and the arrival call. */}
          {cp.is_current && (
            <CheckpointTeamsPanel checkpointId={cp.id} onPurchasedIdsChange={setPurchasedIds} />
          )}
          <MediaGallery media={cp.media} />
        </div>
      )}
    </article>
  );
}

type GuideTab = "postos" | "mapa" | "equipa";

const TABS: Readonly<{ id: GuideTab; label: string; icon: typeof BookOpen }[]> = [
  { id: "postos", label: "Postos", icon: BookOpen },
  { id: "mapa", label: "Mapa", icon: MapIcon },
  { id: "equipa", label: "Equipa", icon: Users },
];

export default function GuidePage() {
  const { isAllowed, isLoading: accessLoading } = useGuideAccess();
  const [tab, setTab] = useState<GuideTab>("postos");

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

      <nav className="flex gap-2 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "postos" &&
        (checkpoints.length === 0 ? (
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
        ))}

      {tab === "mapa" && <MapSection checkpoints={checkpoints} selectedCheckpoint={null} showMap />}

      {tab === "equipa" && <GuideTeamPanel />}
    </div>
  );
}
