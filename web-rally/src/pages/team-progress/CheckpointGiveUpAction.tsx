import { getErrorMessage } from "@/utils/errorHandling";
import type { useCheckpointHints } from "@/hooks/useCheckpointHints";

interface CheckpointGiveUpActionProps {
  canGiveUp: boolean;
  skipCost: number;
  giveUp: ReturnType<typeof useCheckpointHints>["giveUp"];
  onRequestGiveUp: () => void;
}

/**
 * The way out of an unsolvable riddle. Offered only once the hint ladder is
 * spent (canGiveUp already encodes that), so it reads as a last resort
 * rather than a shortcut — the server allows it at any point, this is a nudge.
 */
export default function CheckpointGiveUpAction({
  canGiveUp,
  skipCost,
  giveUp,
  onRequestGiveUp,
}: Readonly<CheckpointGiveUpActionProps>) {
  if (!canGiveUp) return null;

  const skipCostLabel =
    skipCost === 0 ? "Desistir deste posto" : `Desistir deste posto (${skipCost} pts)`;
  const buttonText = giveUp.isPending ? "A desistir…" : skipCostLabel;

  return (
    <div className="space-y-1.5 border-t border-border pt-4 text-center">
      <button
        type="button"
        disabled={giveUp.isPending}
        onClick={onRequestGiveUp}
        className="rally-press rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
      >
        {buttonText}
      </button>
      <p className="text-xs text-muted-foreground">
        Sem pistas por revelar. Se não conseguem mesmo, desistam e sigam para o próximo — mais vale
        isso do que ficarem aqui presos o resto do evento.
      </p>
      {giveUp.isError && (
        <p className="text-center text-xs text-red-500">
          {getErrorMessage(giveUp.error, "Não foi possível desistir do posto.")}
        </p>
      )}
    </div>
  );
}
