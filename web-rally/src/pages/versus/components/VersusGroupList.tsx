import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Swords, Trash2 } from "lucide-react";
import { TeamService, type ListingTeam, type VersusGroupListResponse, type TeamUpdate } from "@/client";
import { useThemedComponents } from "@/components/themes";

type TeamUpdateWithVersus = TeamUpdate & {
  versus_group_id?: number | null;
};

interface VersusGroupListProps {
  versusGroups: VersusGroupListResponse | undefined;
  teams: ListingTeam[] | undefined;
  onSuccess: () => void;
  className?: string;
}

export default function VersusGroupList({ versusGroups, teams, onSuccess, className = "" }: VersusGroupListProps) {
  const { Card: ThemedCard } = useThemedComponents();
  // Remove versus pair mutation (by updating teams to remove versus_group_id)
  const {
    mutate: removeVersusPair,
    isPending: isRemovingPair,
  } = useMutation({
    mutationFn: async (groupId: number) => {
      // Find teams in this group and remove their versus_group_id
      const teamsInGroup = teams?.filter((team) => team.versus_group_id === groupId) || [];
      
      for (const team of teamsInGroup) {
        const updateData: TeamUpdateWithVersus = {
          name: team.name,
          versus_group_id: null,
        };
        await TeamService.updateTeamApiRallyV1TeamIdPut(team.id, updateData);
      }
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  return (
    <ThemedCard variant="default" padding="none" rounded="2xl" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Pares Versus Ativos
        </CardTitle>
        <CardDescription>
          Equipas atualmente emparelhadas para competição direta
        </CardDescription>
      </CardHeader>
      <CardContent>
        {versusGroups?.groups.length === 0 ? (
          <div className="text-center py-8 text-[rgb(255,255,255,0.7)]">
            <Swords className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum par versus criado ainda.</p>
            <p className="text-sm mt-2">Crie o primeiro par usando o formulário acima.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {versusGroups?.groups.map((pair) => {
              const teamA = teams?.find((t) => t.id === pair.team_a_id);
              const teamB = teams?.find((t) => t.id === pair.team_b_id);
              
              if (!teamA || !teamB) return null;
              
              return (
                <ThemedCard
                  key={pair.group_id}
                  variant="nested"
                  padding="md"
                  rounded="lg"
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-red-600">
                        {teamA.name}
                      </Badge>
                      <span className="text-[rgb(255,255,255,0.7)]">vs</span>
                      <Badge variant="default" className="bg-blue-600">
                        {teamB.name}
                      </Badge>
                    </div>
                    <div className="text-sm text-[rgb(255,255,255,0.6)]">
                      {teamA.total} - {teamB.total} pontos
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeVersusPair(pair.group_id)}
                    disabled={isRemovingPair}
                    className="text-red-400 hover:text-red-300 hover:bg-red-600/20"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remover
                  </Button>
                </ThemedCard>
              );
            })}
          </div>
        )}
      </CardContent>
    </ThemedCard>
  );
}








