import { Flag } from "lucide-react";
import useEventTerms from "@/hooks/useEventTerms";

type Props = Readonly<{
  completedCount: number;
  totalCount: number;
  showScore: boolean;
  total: number;
}>;

/**
 * The end of the route.
 *
 * Without this the card that carried the whole game simply vanishes and the
 * team is left staring at a progress bar, with nothing saying they finished.
 */
export default function RouteFinishedCard({ completedCount, totalCount, showScore, total }: Props) {
  const terms = useEventTerms();

  return (
    <div className="rally-surface rally-elevate space-y-3 rounded-2xl p-6 text-center">
      <div className="rally-bg-accent mx-auto grid h-14 w-14 place-items-center rounded-2xl shadow-[var(--rally-shadow-sm)]">
        <Flag className="h-7 w-7 text-white" />
      </div>
      <h2 className="rally-display text-2xl font-bold text-foreground">Chegaram ao fim!</h2>
      <p className="text-sm text-muted-foreground">
        {completedCount} de {totalCount} {terms.checkpoints} — está tudo feito.
      </p>
      {showScore && (
        <p className="rally-display text-4xl font-bold tabular-nums text-foreground">
          {total} <span className="text-base font-normal text-muted-foreground">pts</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        A classificação final só fecha quando o staff terminar as avaliações.
      </p>
    </div>
  );
}
