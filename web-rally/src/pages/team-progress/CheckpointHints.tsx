import { Lightbulb } from "lucide-react";
import { isOfflineFailure } from "./useCheckpointArrival";
import { getErrorMessage } from "@/utils/errorHandling";
import type { useCheckpointHints } from "@/hooks/useCheckpointHints";

interface CheckpointHintsProps {
  hints: ReturnType<typeof useCheckpointHints>;
  hasHintLadder: boolean;
  hintCostLabel: string;
  totalSpent: number;
  onRequestHint: () => void;
}

/** The hint ladder: revealed hints so far, cost paid, and the reveal-next button. */
export default function CheckpointHints({
  hints,
  hasHintLadder,
  hintCostLabel,
  totalSpent,
  onRequestHint,
}: Readonly<CheckpointHintsProps>) {
  if (!hasHintLadder) return null;

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5" />
        Pistas
      </div>
      {hints.revealed.map((item) => (
        <div key={item.indication_id} className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed text-foreground">• {item.hint}</p>
          {/* What this hint cost, at the price it was bought for. Nothing else
              in the team's app shows the deduction — the awards that carry it
              are admin-only — so without this the score just drops with no
              explanation. */}
          {item.cost !== 0 && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {item.cost} pts
            </span>
          )}
        </div>
      ))}
      {totalSpent !== 0 && (
        <p className="text-xs text-muted-foreground">
          Neste posto: {totalSpent} pts
          {hints.totalSpentInEvent !== totalSpent &&
            ` · em todo o percurso: ${hints.totalSpentInEvent} pts`}
        </p>
      )}
      {hints.remaining > 0 && (
        <button
          type="button"
          disabled={hints.reveal.isPending}
          onClick={onRequestHint}
          className="rally-press w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold transition-all hover:bg-accent/40 disabled:opacity-60"
        >
          {hints.reveal.isPending
            ? "A revelar…"
            : `Pedir pista${hintCostLabel} · faltam ${hints.remaining}`}
        </button>
      )}
      {hints.reveal.isError && (
        <p className="text-center text-xs text-red-500">
          {isOfflineFailure(hints.reveal.error)
            ? // Deliberately not queued like an arrival. A check-in is a fact
              // about where the team stood, safe to replay; buying a hint
              // spends points, and replaying it later would charge them for a
              // hint nobody was there to read — possibly at a post they have
              // since left. Say so instead of failing silently or queueing.
              "Sem rede. Pede a pista quando tiveres ligação — não fica guardada para não gastares pontos sem veres o resultado."
            : getErrorMessage(hints.reveal.error, "Não foi possível revelar a pista.")}
        </p>
      )}
    </div>
  );
}
