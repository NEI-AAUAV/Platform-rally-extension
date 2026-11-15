import type { EventTerms } from "@/lib/eventTerms";

type RouteUpcomingItemProps = Readonly<{ terms: EventTerms }>;

/**
 * Closing row of the team's route list on a focused route: the server only
 * sends what the team has finished plus what is open now, so without it the
 * list reads as the whole route. Carries no count on purpose.
 */
export default function RouteUpcomingItem({ terms }: RouteUpcomingItemProps) {
  const restantes = terms.checkpointGender === "f" ? "As restantes" : "Os restantes";
  return (
    <li
      aria-label={`Mais ${terms.checkpoints} por revelar`}
      className="flex list-none items-center gap-3 rounded-xl px-3 py-2.5"
    >
      <span
        aria-hidden
        className="rally-num rally-accent grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-border text-sm font-bold"
      >
        ?
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          Mais {terms.checkpoints} por revelar
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {restantes} {terms.checkpoints} revelam-se à medida que o percurso decorre.
        </span>
      </span>
    </li>
  );
}
