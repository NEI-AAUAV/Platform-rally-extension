import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Swords, Trash2 } from "lucide-react";

interface VersusPair {
  group_id: number;
  team_a_id: number;
  team_b_id: number;
}

interface Team {
  id: number;
  name: string;
  total: number;
  classification: number;
  versus_group_id?: number;
}

interface VersusGroupListResponse {
  groups: VersusPair[];
}

interface VersusGroupListProps {
  versusGroups: VersusGroupListResponse | undefined;
  teams: Team[] | undefined;
  userToken: string;
  onSuccess: () => void;
  className?: string;
}

export default function VersusGroupList({ versusGroups, teams, userToken, onSuccess, className = "" }: VersusGroupListProps) {
  // Remove versus pair mutation (by updating teams to remove versus_group_id)
  const {
    mutate: removeVersusPair,
    isPending: isRemovingPair,
  } = useMutation({
    mutationFn: async (groupId: number) => {
      // Find teams in this group and remove their versus_group_id
      const teamsInGroup = teams?.filter((team: Team) => team.versus_group_id === groupId) || [];
      
      for (const team of teamsInGroup) {
        const response = await fetch(`/api/rally/v1/team/${team.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            name: team.name,
            versus_group_id: null,
          }),
        });
        if (!response.ok) throw new Error("Failed to remove versus pair");
      }
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  return (
    <Card className={className}>
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
              const teamA = teams?.find((t: Team) => t.id === pair.team_a_id);
              const teamB = teams?.find((t: Team) => t.id === pair.team_b_id);
              
              if (!teamA || !teamB) return null;
              
              return (
                <div
                  key={pair.group_id}
                  className="flex items-center justify-between p-4 bg-[rgb(255,255,255,0.04)] rounded-lg border border-[rgb(255,255,255,0.15)]"
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
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


