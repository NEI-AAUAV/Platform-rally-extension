import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, AlertCircle } from "lucide-react";
import { VersusService, type VersusPairCreate, type VersusPairResponse, type ListingTeam } from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import { useThemedComponents } from "@/components/themes";

interface VersusPairFormProps {
  teams: ListingTeam[] | undefined;
  onSuccess: () => void;
  className?: string;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    body?: { detail?: string };
    response?: { data?: { detail?: string } };
    message?: string;
  };

  if (typeof candidate.body?.detail === "string") {
    return candidate.body.detail;
  }

  if (typeof candidate.response?.data?.detail === "string") {
    return candidate.response.data.detail;
  }

  if (typeof candidate.message === "string" && candidate.message.length > 0) {
    return candidate.message;
  }

  return fallback;
};

export default function VersusPairForm({ teams, onSuccess, className = "" }: VersusPairFormProps) {
  const { Card } = useThemedComponents();
  const toast = useAppToast();
  const [selectedTeamA, setSelectedTeamA] = useState<string>("");
  const [selectedTeamB, setSelectedTeamB] = useState<string>("");

  // Create versus pair mutation
  const {
    mutate: createVersusPair,
    isPending: isCreatingPair,
    error: createError,
  } = useMutation({
    mutationFn: async (pairData: { team_a_id: number; team_b_id: number }): Promise<VersusPairResponse> => {
      const requestBody: VersusPairCreate = {
        team_a_id: pairData.team_a_id,
        team_b_id: pairData.team_b_id,
      };
      return VersusService.createVersusPairApiRallyV1VersusPairPost(requestBody);
    },
    onSuccess: () => {
      onSuccess();
      setSelectedTeamA("");
      setSelectedTeamB("");
      toast.success("Par versus criado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar par versus"));
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
  const availableTeams = teams?.filter((team) => !team.versus_group_id) || [];

  return (
    <Card variant="default" padding="none" rounded="2xl" className={className}>
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
                {availableTeams.map((team) => (
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
                  .filter((team) => team.id.toString() !== selectedTeamA)
                  .map((team) => (
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
  );
}








