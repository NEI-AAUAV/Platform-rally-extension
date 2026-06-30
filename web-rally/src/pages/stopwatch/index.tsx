import { useState, useEffect, useRef, useCallback } from "react";
import { Navigate } from "@tanstack/react-router";
import { Timer, Play, Pause, RotateCcw, Flag } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { LoadingState } from "@/components/shared";

interface Lap {
  n: number;
  elapsed: number;
  split: number;
}

function fmt(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`
    : `${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

export default function StopwatchPage() {
  const scopes = useUserStore((s) => s.scopes);
  const sessionLoading = useUserStore((s) => s.sessionLoading);

  const isAllowed =
    scopes?.includes("rally-staff") ||
    scopes?.includes("admin") ||
    scopes?.includes("manager-rally") ||
    scopes?.includes("rally:admin");

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (startRef.current !== null) {
      setElapsed(baseRef.current + (Date.now() - startRef.current));
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const start = () => {
    startRef.current = Date.now();
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    if (startRef.current !== null) {
      baseRef.current += Date.now() - startRef.current;
      startRef.current = null;
    }
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setRunning(false);
  };

  const reset = () => {
    pause();
    baseRef.current = 0;
    startRef.current = null;
    setElapsed(0);
    setLaps([]);
  };

  const lap = () => {
    const prev = laps.length > 0 ? laps[laps.length - 1]!.elapsed : 0;
    setLaps((ls) => [
      ...ls,
      { n: ls.length + 1, elapsed, split: elapsed - prev },
    ]);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (sessionLoading) return <LoadingState message="A carregar…" />;
  if (!isAllowed) return <Navigate to="/" replace />;

  const bestLap = laps.length > 1
    ? Math.min(...laps.map((l) => l.split))
    : null;
  const worstLap = laps.length > 1
    ? Math.max(...laps.map((l) => l.split))
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <header>
        <p className="rally-accent inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em]">
          <Timer className="h-3.5 w-3.5" /> Ferramenta de staff
        </p>
        <h1 className="rally-display mt-2 text-4xl font-bold text-foreground sm:text-5xl">
          Cronómetro
        </h1>
      </header>

      {/* Main display */}
      <div className="rally-surface flex flex-col items-center gap-6 py-10">
        <time
          dateTime={`PT${Math.floor(elapsed / 1000)}S`}
          className="font-mono text-6xl font-bold tabular-nums tracking-tight sm:text-7xl"
          aria-live="off"
        >
          {fmt(elapsed)}
        </time>

        <div className="flex gap-3">
          {!running ? (
            <button
              type="button"
              onClick={start}
              className="rally-press flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition hover:bg-green-600"
              aria-label="Iniciar"
            >
              <Play className="h-6 w-6 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={pause}
              className="rally-press flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition hover:bg-amber-600"
              aria-label="Pausar"
            >
              <Pause className="h-6 w-6 fill-current" />
            </button>
          )}

          <button
            type="button"
            onClick={lap}
            disabled={!running}
            className="rally-press flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition disabled:opacity-30"
            aria-label="Volta"
          >
            <Flag className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={reset}
            disabled={running || (elapsed === 0 && laps.length === 0)}
            className="rally-press flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-accent disabled:opacity-30"
            aria-label="Reiniciar"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Lap list */}
      {laps.length > 0 && (
        <div className="rally-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Split</th>
                <th className="px-4 py-2.5 text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {[...laps].reverse().map((l) => {
                const isBest = bestLap !== null && l.split === bestLap;
                const isWorst = worstLap !== null && l.split === worstLap;
                return (
                  <tr key={l.n} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-muted-foreground">
                      {l.n}
                    </td>
                    <td
                      className={[
                        "px-4 py-2.5 font-mono font-semibold tabular-nums",
                        isBest ? "text-green-500" : isWorst ? "text-red-500" : "",
                      ].join(" ")}
                    >
                      {fmt(l.split)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {fmt(l.elapsed)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
