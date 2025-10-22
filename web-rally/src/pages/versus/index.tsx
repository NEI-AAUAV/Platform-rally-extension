import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Swords, Users, Plus, Trash2, AlertCircle } from "lucide-react";
import useUser from "@/hooks/useUser";
import useRallySettings from "@/hooks/useRallySettings";
import { Navigate } from "react-router-dom";

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

export default function Versus() {
  const { isLoading, userStoreStuff } = useUser();
  const { settings } = useRallySettings();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const [selectedTeamA, setSelectedTeamA] = useState<string>("");
  const [selectedTeamB, setSelectedTeamB] = useState<string>("");

  // Fetch teams
  const { data: teams, refetch: refetchTeams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/team/");
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
  });

  // Fetch versus groups
  const { data: versusGroups, refetch: refetchVersusGroups } = useQuery({
    queryKey: ["versusGroups"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/versus/groups", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch versus groups");
      return response.json() as Promise<VersusGroupListResponse>;
    },
    enabled: isManager,
  });

  // Create versus pair mutation
  const {
    mutate: createVersusPair,
    isPending: isCreatingPair,
    error: createError,
  } = useMutation({
    mutationFn: async (pairData: { team_a_id: number; team_b_id: number }) => {
      const response = await fetch("/api/rally/v1/versus/pair", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(pairData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create versus pair");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchVersusGroups();
      refetchTeams();
      setSelectedTeamA("");
      setSelectedTeamB("");
    },
    onError: (error: any) => {
      console.error("Error creating versus pair:", error);
    },
  });

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
            Authorization: `Bearer ${userStoreStuff.token}`,
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
      refetchVersusGroups();
      refetchTeams();
    },
  });

  const handleCreatePair = () => {
    if (!selectedTeamA || !selectedTeamB) {
      return;
    }
    
    if (selectedTeamA === selectedTeamB) {
      return;
    }

    createVersusPair({
      team_a_id: parseInt(selectedTeamA),
      team_b_id: parseInt(selectedTeamB),
    });
  };

  // Get teams that are not already in versus groups
  const availableTeams = teams?.filter((team: Team) => !team.versus_group_id) || [];

  if (isLoading) {
    return <div className="mt-16 text-center">Carregando...</div>;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  if (!settings?.enable_versus) {
    return (
      <div className="mt-16 text-center space-y-4">
        <Alert className="max-w-md mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            O modo versus não está ativado. Ative-o nas configurações para usar esta funcionalidade.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <a href="/settings">Ir para Configurações</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
          <Swords className="w-6 h-6" />
          Modo Versus
        </h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Gerir pares de equipas para competições diretas
        </p>
      </div>

      {/* Create New Versus Pair */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Criar Novo Par Versus
          </CardTitle>
          <CardDescription>
            Selecione duas equipas para criar um par de competição direta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {createError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {createError.message}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="team-a-select" className="text-sm font-medium">Equipa A</label>
              <Select value={selectedTeamA} onValueChange={setSelectedTeamA}>
                <SelectTrigger id="team-a-select">
                  <SelectValue placeholder="Selecionar equipa A" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams.map((team: Team) => (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      {team.name} ({team.total} pontos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="team-b-select" className="text-sm font-medium">Equipa B</label>
              <Select value={selectedTeamB} onValueChange={setSelectedTeamB}>
                <SelectTrigger id="team-b-select">
                  <SelectValue placeholder="Selecionar equipa B" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams
                    .filter((team: Team) => team.id.toString() !== selectedTeamA)
                    .map((team: Team) => (
                      <SelectItem key={team.id} value={team.id.toString()}>
                        {team.name} ({team.total} pontos)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-center">
            <Button
              onClick={handleCreatePair}
              disabled={!selectedTeamA || !selectedTeamB || selectedTeamA === selectedTeamB || isCreatingPair}
              className="min-w-[200px]"
            >
              {isCreatingPair ? "A Criar..." : "Criar Par Versus"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Versus Pairs */}
      <Card>
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
    </div>
  );
}


