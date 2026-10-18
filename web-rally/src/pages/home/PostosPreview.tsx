import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { getCheckpoints, type DetailedCheckPoint } from "@/client";
import SectionHeader from "./SectionHeader";

const PREVIEW_LIMIT = 6;

interface PostosPreviewProps {
  /** Public visibility of the checkpoint list (settings.show_checkpoint_map). */
  readonly enabled: boolean;
}

/**
 * Homepage preview of the checkpoint route. Only shown when the organiser has
 * made the checkpoint map public; the query is best-effort (404/403 for
 * restricted viewers simply hides the section).
 */
export function PostosPreview({ enabled }: PostosPreviewProps) {
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => (await getCheckpoints()).data,
    retry: false,
    enabled,
  });

  if (!enabled || !Array.isArray(checkpoints) || checkpoints.length === 0) return null;

  const ordered = [...checkpoints]
    .sort((a: DetailedCheckPoint, b: DetailedCheckPoint) => a.order - b.order)
    .slice(0, PREVIEW_LIMIT);
  const remaining = checkpoints.length - ordered.length;

  return (
    <section aria-labelledby="postos-heading">
      <SectionHeader
        id="postos-heading"
        eyebrow="Mapa"
        title="Postos"
        action={
          <Link
            to="/checkpoints"
            className="rally-accent inline-flex items-center gap-1 rounded-md text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver mapa
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((cp) => (
          <li
            key={cp.id}
            className="flex items-start gap-3.5 rounded-[18px] border border-border bg-card p-4"
          >
            <span className="rally-display grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-foreground/80 text-sm font-bold tabular-nums text-foreground">
              {cp.order}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{cp.name}</p>
              {cp.description && (
                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                  {cp.description}
                </p>
              )}
            </div>
          </li>
        ))}
        {remaining > 0 && (
          <li className="flex items-center justify-center rounded-[18px] border border-dashed border-border p-4 text-sm font-medium text-muted-foreground">
            <MapPin className="mr-2 h-4 w-4" />+{remaining} postos
          </li>
        )}
      </ul>
    </section>
  );
}

export default PostosPreview;
