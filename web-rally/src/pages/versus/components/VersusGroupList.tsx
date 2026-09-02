import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Swords, Trash2 } from "lucide-react";
import { removeVersusGroup, type ListingTeam, type VersusGroupListResponse } from "@/client";

type VersusGroupListProps = Readonly<{
  versusGroups: VersusGroupListResponse | undefined;
  teams: ListingTeam[] | undefined;
  onSuccess: () => void;
  className?: string;
}>;

export default function VersusGroupList({
  versusGroups,
  teams,
  onSuccess,
  className = "",
}: VersusGroupListProps) {
  const { mutate: removeVersusPair, isPending: isRemovingPair } = useMutation({
    mutationFn: async (groupId: number) => removeVersusGroup({ path: { group_id: groupId } }),
    onSuccess: () => {
      onSuccess();
    },
  });

  return (
    <div className={`rally-surface rounded-2xl ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Pares Versus Ativos
        </CardTitle>
        <CardDescription>Equipas atualmente emparelhadas para competição direta</CardDescription>
      </CardHeader>
      <CardContent>
        {versusGroups?.groups.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Swords className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Nenhum par versus criado ainda.</p>
            <p className="mt-2 text-sm">Crie o primeiro par usando o formulário acima.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {versusGroups?.groups.map((pair) => {
              const teamA = teams?.find((t) => t.id === pair.team_a_id);
              const teamB = teams?.find((t) => t.id === pair.team_b_id);

              if (!teamA || !teamB) return null;

              return (
                <div
                  key={pair.group_id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary p-3 sm:p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-red-600">
                        {teamA.name}
                      </Badge>
                      <span className="text-muted-foreground">vs</span>
                      <Badge variant="default" className="bg-blue-600">
                        {teamB.name}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {teamA.total} - {teamB.total} pontos
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeVersusPair(pair.group_id)}
                    disabled={isRemovingPair}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </div>
  );
}
