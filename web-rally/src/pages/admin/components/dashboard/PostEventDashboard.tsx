import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { getTeams, type ListingTeam } from "@/client";
import { sortTeamsByRank, displayRank } from "@/lib/teamRanking";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Shown once the event has ended — final standings, no readiness UI (that's moot post-event). */
export default function PostEventDashboard() {
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
  });

  const rankedTeams = useMemo(
    () => sortTeamsByRank(Array.isArray(teams) ? (teams as ListingTeam[]) : []),
    [teams],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-muted-foreground" />
        <h2 className="rally-display text-lg font-bold text-foreground">Prova terminada</h2>
      </div>

      {rankedTeams.length > 0 ? (
        <div className="rally-surface rounded-xl border border-border p-5 shadow-[var(--rally-shadow-sm)]">
          <h3 className="rally-display mb-4 text-base font-bold text-foreground">
            Classificação final
          </h3>
          <div className="flex flex-col gap-2">
            {rankedTeams.map((team, index) => (
              <div
                key={team.id}
                className="flex items-center gap-[13px] rounded-[12px] bg-muted/40 px-[14px] py-[11px]"
              >
                <span className="rally-display w-6 text-center text-base font-bold tabular-nums text-muted-foreground">
                  {displayRank(index)}
                </span>
                <span className="rally-bg-accent-soft grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-xs font-bold text-foreground">
                  {initialsOf(team.name)}
                </span>
                <span className="flex-1 truncate text-sm font-semibold text-foreground">
                  {team.name}
                </span>
                <span className="rally-display shrink-0 text-[15px] font-bold tabular-nums text-foreground">
                  {team.total}
                  <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">pts</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sem equipas para apresentar.</p>
      )}
    </div>
  );
}
