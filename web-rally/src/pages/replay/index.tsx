import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { History, Pause, Play, RotateCcw } from "lucide-react";
import useReplay from "./useReplay";
import { Button } from "@/components/ui/button";

const STEP_MS = 900;

/**
 * Post-event replay: animate the leaderboard's evolution by stepping through
 * the recorded score timeline. Rows reorder with a spring as ranks change.
 */
export default function Replay() {
  const { frames, isLoading } = useReplay();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const lastIndex = Math.max(frames.length - 1, 0);

  // Advance while playing; stop at the end.
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    if (index >= lastIndex) {
      setPlaying(false);
      return;
    }
    const timer = globalThis.setTimeout(() => setIndex((i) => i + 1), STEP_MS);
    return () => globalThis.clearTimeout(timer);
  }, [playing, index, lastIndex, frames.length]);

  if (isLoading) {
    return (
      <div className="rally-surface rounded-2xl p-6 text-center text-muted-foreground">
        A carregar replay...
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="space-y-6">
        <ReplayHeader />
        <div className="rally-surface rounded-2xl p-8 text-center">
          <p className="text-lg font-semibold">Ainda não há replay</p>
          <p className="mt-2 text-sm text-muted-foreground">
            O histórico de pontuações aparece aqui assim que as equipas começarem
            a pontuar.
          </p>
        </div>
      </div>
    );
  }

  const rows = frames[Math.min(index, lastIndex)]?.rows ?? [];

  const restart = () => {
    setIndex(0);
    setPlaying(true);
  };

  return (
    <div className="space-y-6">
      <ReplayHeader />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => (index >= lastIndex ? restart() : setPlaying((p) => !p))}
          className="gap-1.5"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pausa" : index >= lastIndex ? "Recomeçar" : "Reproduzir"}
        </Button>
        <Button type="button" variant="outline" onClick={restart} className="gap-1.5">
          <RotateCcw className="h-4 w-4" /> Início
        </Button>
        <input
          aria-label="Linha temporal do replay"
          type="range"
          min={0}
          max={lastIndex}
          value={Math.min(index, lastIndex)}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          className="rally-accent h-1.5 flex-1 min-w-[8rem] cursor-pointer accent-[var(--rally-accent)]"
        />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {Math.min(index, lastIndex) + 1}/{frames.length}
        </span>
      </div>

      <motion.ol layout className="grid gap-2">
        {rows.map((row) => (
          <motion.li
            key={row.teamId}
            layout
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="rally-surface flex items-center gap-4 px-4 py-3"
          >
            <span className="rally-display w-7 shrink-0 text-center text-xl font-bold tabular-nums text-muted-foreground">
              {row.rank}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
              {row.teamName}
            </span>
            <span className="rally-display shrink-0 text-lg font-bold tabular-nums text-foreground">
              {row.total}
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                pts
              </span>
            </span>
          </motion.li>
        ))}
      </motion.ol>
    </div>
  );
}

function ReplayHeader() {
  return (
    <header>
      <p className="rally-accent inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em]">
        <History className="h-3.5 w-3.5" /> Revive a competição
      </p>
      <h1 className="rally-display mt-2 text-4xl font-bold text-foreground sm:text-5xl">
        Replay
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Vê a classificação evoluir ao longo do evento.
      </p>
    </header>
  );
}
