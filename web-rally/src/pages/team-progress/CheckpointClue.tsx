import { Sparkles } from "lucide-react";

interface CheckpointClueProps {
  isRedacted: boolean;
  clue?: string | null;
  clueMediaUrl?: string | null;
}

/**
 * The riddle: this is the whole game in a peddy paper, so it sits above the
 * fold, before the map and the check-in button. Absent clue means a guided
 * event — nothing renders and the card behaves as it always did.
 */
export default function CheckpointClue({
  isRedacted,
  clue,
  clueMediaUrl,
}: Readonly<CheckpointClueProps>) {
  if (isRedacted && !clue) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Sem enigma na app — aguarda as indicações do guia no local de partida.
      </p>
    );
  }

  if (!clue) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="rally-accent mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <Sparkles className="h-3.5 w-3.5" />
        Enigma
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{clue}</p>
      {clueMediaUrl && (
        <img
          src={clueMediaUrl}
          alt="Pista visual do enigma"
          loading="lazy"
          className="mt-3 max-h-64 w-full rounded-lg object-cover"
        />
      )}
    </div>
  );
}
