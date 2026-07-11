import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { getCheckpoints, type DetailedCheckPoint } from "@/client";

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
      <div className="flex items-center justify-between">
        <h2
          id="postos-heading"
          className="rally-display text-2xl font-bold text-foreground sm:text-3xl"
        >
          Postos
        </h2>
        <Link
          to="/postos"
          className="rally-accent inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          Ver mapa
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((cp) => (
          <li key={cp.id} className="rally-surface flex items-start gap-3 p-4">
            <span className="rally-bg-accent-soft grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-foreground">
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
          <li className="flex items-center justify-center rounded-lg border border-dashed border-border p-4 text-sm font-medium text-muted-foreground">
            <MapPin className="mr-2 h-4 w-4" />+{remaining} postos
          </li>
        )}
      </ul>
    </section>
  );
}

export default PostosPreview;
