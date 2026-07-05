import { Play, Pause, RotateCcw, Flag } from "lucide-react";
import { useStopwatch, formatStopwatchTime } from "@/hooks/useStopwatch";

interface StopwatchWidgetProps {
  readonly onUseTime: (seconds: number) => void;
}

export default function StopwatchWidget({ onUseTime }: StopwatchWidgetProps) {
  const { running, elapsed, laps, start, pause, reset, lap } = useStopwatch();

  const bestLap = laps.length > 1 ? Math.min(...laps.map((l) => l.split)) : null;
  const worstLap = laps.length > 1 ? Math.max(...laps.map((l) => l.split)) : null;

  return (
    <div className="rally-surface flex flex-col items-center gap-4 rounded-lg p-4">
      <time
        dateTime={`PT${Math.floor(elapsed / 1000)}S`}
        className="font-mono text-3xl font-bold tabular-nums tracking-tight"
        aria-live="off"
      >
        {formatStopwatchTime(elapsed)}
      </time>

      <div className="flex gap-2">
        {running ? (
          <button
            type="button"
            onClick={pause}
            className="rally-press flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white shadow transition hover:bg-amber-600"
            aria-label="Pausar"
          >
            <Pause className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="rally-press flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow transition hover:bg-green-600"
            aria-label="Iniciar"
          >
            <Play className="h-4 w-4 fill-current" />
          </button>
        )}

        <button
          type="button"
          onClick={lap}
          disabled={!running}
          className="rally-press flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition disabled:opacity-30"
          aria-label="Volta"
        >
          <Flag className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={reset}
          disabled={running || (elapsed === 0 && laps.length === 0)}
          className="rally-press flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-accent disabled:opacity-30"
          aria-label="Reiniciar"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => onUseTime(elapsed / 1000)}
          disabled={elapsed === 0}
          className="rally-press rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent disabled:opacity-30"
        >
          Usar tempo
        </button>
      </div>

      {laps.length > 0 && (
        <div className="w-full overflow-hidden rounded border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-1.5">#</th>
                <th className="px-3 py-1.5">Split</th>
                <th className="px-3 py-1.5 text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {[...laps].reverse().map((l) => {
                const isBest = bestLap !== null && l.split === bestLap;
                const isWorst = worstLap !== null && l.split === worstLap;
                let splitClass = "";
                if (isBest) {
                  splitClass = "text-green-500";
                } else if (isWorst) {
                  splitClass = "text-red-500";
                }
                return (
                  <tr key={l.n} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-1.5 font-semibold text-muted-foreground">{l.n}</td>
                    <td
                      className={["px-3 py-1.5 font-mono font-semibold tabular-nums", splitClass].join(" ")}
                    >
                      {formatStopwatchTime(l.split)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {formatStopwatchTime(l.elapsed)}
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
