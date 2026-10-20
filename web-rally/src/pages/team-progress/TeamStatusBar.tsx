import { Timer } from "lucide-react";
import type { PrivilegedDetailedTeam } from "@/client";
import useEventTerms from "@/hooks/useEventTerms";
import { formatElapsed } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useElapsed } from "./useElapsed";

type TeamStatusBarProps = Readonly<{
  team: PrivilegedDetailedTeam;
  showScore: boolean;
  showRanking: boolean;
  /** Position under the shared ranking policy (`lib/teamRanking`), or null
   * when the standings are not loaded. */
  rank: number | null;
  resolvedCount: number;
  totalCount: number;
}>;

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function Stat({
  value,
  label,
  emphasis = false,
}: Readonly<{ value: string; label: string; emphasis?: boolean }>) {
  return (
    <div className="flex flex-col items-end">
      <span
        className={cn(
          "rally-num text-base font-bold leading-none sm:text-lg",
          emphasis ? "rally-accent" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/**
 * Who the team is and how it is doing, in one compact strip. Everything else
 * that used to live in the header (access code, departure, start/end times)
 * is reference material and sits in the "Equipa" view instead.
 */
export default function TeamStatusBar({
  team,
  showScore,
  showRanking,
  rank,
  resolvedCount,
  totalCount,
}: TeamStatusBarProps) {
  const terms = useEventTerms();
  const elapsed = useElapsed(team);
  const percent = Math.round((resolvedCount / (totalCount || 1)) * 100);

  return (
    <header className="rally-surface px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="rally-bg-accent rally-display grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg text-white"
        >
          {initialsOf(team.name)}
        </span>
        <h1 className="rally-display min-w-0 flex-1 truncate text-2xl text-foreground sm:text-3xl">
          {team.name}
        </h1>
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          {showRanking && <Stat value={rank != null ? `#${rank}` : "—"} label="Posição" emphasis />}
          {showScore && <Stat value={String(team.total)} label="Pontos" />}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div
          className="h-1.5 min-w-[6rem] flex-1 basis-24 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Progresso do percurso"
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-valuenow={resolvedCount}
        >
          <div
            className="rally-bg-accent h-full origin-left rounded-full transition-transform duration-700 ease-out"
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>
        <span className="rally-num shrink-0 text-xs font-bold text-muted-foreground">
          {resolvedCount}/{totalCount} {terms.checkpoints}
        </span>
        {elapsed != null && (
          <span
            className="rally-num inline-flex shrink-0 items-center gap-1 text-xs font-bold text-foreground"
            title={team.finished_at ? "Tempo final" : "Tempo a decorrer"}
          >
            <Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="sr-only">
              {team.finished_at ? "Tempo final" : "Tempo a decorrer"}:
            </span>
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>
    </header>
  );
}
