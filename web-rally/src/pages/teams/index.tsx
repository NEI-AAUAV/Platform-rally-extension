import { TeamService } from "@/client";
import { Team } from "@/components/shared";
import { useQuery } from "@tanstack/react-query";
import useRallySettings from "@/hooks/useRallySettings";

export default function Teams() {
  const { settings } = useRallySettings();
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
  });
  const sortedTeams = teams?.sort(
    (a, b) => a.classification - b.classification,
  );
  return (
    <div className="mt-16 grid gap-8">
      {sortedTeams?.map((team) =>
        settings?.show_team_details === false ? (
          <div
            key={team.id}
            className="grid gap-4 rounded-2xl border-2 border-[rgb(255,255,255,0.15)] bg-[rgb(255,255,255,0.04)] p-6"
          >
            <div className="text-center text-sm text-white/70">Detalhes da equipa ocultos</div>
            <div className="flex items-center justify-center gap-2 text-lg font-semibold">
              <span>{team.name}</span>
              <span className="text-white/60">|</span>
              <span>{team.total} pontos</span>
              <span className="text-white/60">|</span>
              <span>{team.classification}º</span>
            </div>
          </div>
        ) : (
          <Team key={team.id} team={team} />
        )
      )}
    </div>
  );
}
