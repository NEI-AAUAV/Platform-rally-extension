import type { DetailedTeam } from "@/client";

type TeamHeaderCardProps = Readonly<{
  team: DetailedTeam;
  showScore: boolean;
  showRanking: boolean;
  completedCount: number;
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

export default function TeamHeaderCard({
  team,
  showScore,
  showRanking,
  completedCount,
  totalCount,
}: TeamHeaderCardProps) {
  const initials = initialsOf(team.name);

  return (
    <div className="rally-bg-accent relative overflow-hidden rounded-2xl p-6 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div className="relative z-10">
        <div className="flex items-center gap-4">
          <span className="rally-display grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-xl font-bold">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="rally-display truncate text-xl font-bold leading-tight">{team.name}</p>
            {team.access_code && (
              <p className="mt-0.5 text-sm opacity-80">Código: {team.access_code}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex gap-6">
          {showRanking && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">
                #{team.classification}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">Posição</p>
            </div>
          )}
          {showScore && (
            <div>
              <p className="rally-display text-3xl font-bold tabular-nums">{team.total}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">Pontos</p>
            </div>
          )}
          <div>
            <p className="rally-display text-3xl font-bold tabular-nums">
              {completedCount}/{totalCount}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.06em] opacity-80">Postos</p>
          </div>
        </div>
      </div>
    </div>
  );
}
