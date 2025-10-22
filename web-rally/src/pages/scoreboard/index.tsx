import { BloodyScore } from "@/components/themes/bloody";
import { TeamService } from "@/client";
import { useQuery } from "@tanstack/react-query";
import useRallySettings from "@/hooks/useRallySettings";

export default function Scoreboard() {
  const { settings } = useRallySettings();
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
  });
  const sortedTeams = teams?.sort(
    (a, b) => a.classification - b.classification,
  );
  if (settings?.show_live_leaderboard === false) {
    return (
      <div className="mt-16 rounded-2xl border border-[rgb(255,255,255,0.15)] bg-[rgb(255,255,255,0.04)] p-8 text-center">
        <div className="text-lg font-semibold">Leaderboard indisponível</div>
        <div className="text-white/70 mt-2 text-sm">
          O organizador desativou a visualização do leaderboard em tempo real.
        </div>
      </div>
    );
  }
  return (
    <div className="mt-16 grid gap-4">
      {sortedTeams?.map((team) => <BloodyScore key={team.id} team={team} />)}
    </div>
  );
}
