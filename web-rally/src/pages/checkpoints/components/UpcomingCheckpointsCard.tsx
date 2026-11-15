import useEventTerms from "@/hooks/useEventTerms";

/**
 * Stand-in for the posts a focused route keeps out of the team's list.
 *
 * Without it a team that has only the first post open sees a one-item list
 * and reads it as the whole route. Deliberately carries no count: how many
 * posts remain is part of what the route mode keeps hidden.
 */
export default function UpcomingCheckpointsCard() {
  const terms = useEventTerms();
  const feminino = terms.checkpointGender === "f";
  const restantes = feminino ? "As restantes" : "Os restantes";
  const revelam = "revelam-se à medida que o percurso decorre.";

  return (
    <article
      aria-label={`Mais ${terms.checkpoints} por revelar`}
      className="overflow-hidden rounded-3xl border border-dashed border-border bg-card/60"
    >
      <div className="flex w-full items-center gap-4 p-[16px_18px]">
        <span
          aria-hidden="true"
          className="rally-display rally-accent grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-3xl"
        >
          ?
        </span>
        <div className="min-w-0 flex-1">
          <p className="rally-display text-2xl text-foreground">
            Mais {terms.checkpoints} por revelar
          </p>
          <p className="mt-[3px] text-sm text-muted-foreground">
            {restantes} {terms.checkpoints} {revelam}
          </p>
        </div>
      </div>
    </article>
  );
}
