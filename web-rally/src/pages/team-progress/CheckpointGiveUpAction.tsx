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

  const buttonText = giveUp.isPending
    ? "A desistir…"
    : skipCost === 0
      ? "Desistir deste posto"
      : `Desistir deste posto (${skipCost} pts)`;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <button
        type="button"
        disabled={giveUp.isPending}
        onClick={onRequestGiveUp}
        className="rally-press w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground transition-all hover:bg-accent/30 disabled:opacity-60"
      >
        {buttonText}
      </button>
      <p className="text-center text-xs text-muted-foreground">
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
