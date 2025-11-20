import { TeamService, type ListingTeam } from "@/client";
import { useQuery } from "@tanstack/react-query";
import useRallySettings from "@/hooks/useRallySettings";
import { useThemedComponents } from "@/components/themes";

export default function Scoreboard() {
  const { Card, Score } = useThemedComponents();
  const { settings } = useRallySettings();
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
  });
  const sortedTeams = teams?.sort(
    (a: ListingTeam, b: ListingTeam) => a.classification - b.classification,
  );
  if (settings?.show_live_leaderboard === false) {
    return (
      <Card variant="default" padding="lg" rounded="2xl" className="mt-16 text-center">
        <div className="text-lg font-semibold">Leaderboard indisponível</div>
        <div className="text-white/70 mt-2 text-sm">
          O organizador desativou a visualização do leaderboard em tempo real.
        </div>
      </Card>
    );
  }
  return (
    <div className="mt-16 grid gap-4">
      {sortedTeams?.map((team: ListingTeam) => <Score key={team.id} team={team} />)}
    </div>
  );
}
