import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, AlertCircle } from "lucide-react";

interface Team {
  id: number;
  name: string;
  total: number;
  classification: number;
  versus_group_id?: number;
}

interface VersusPairFormProps {
  teams: Team[] | undefined;
  userToken: string;
  onSuccess: () => void;
  className?: string;
}

export default function VersusPairForm({ teams, userToken, onSuccess, className = "" }: VersusPairFormProps) {
  const [selectedTeamA, setSelectedTeamA] = useState<string>("");
  const [selectedTeamB, setSelectedTeamB] = useState<string>("");

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
          Authorization: `Bearer ${userToken}`,
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
      onSuccess();
      setSelectedTeamA("");
      setSelectedTeamB("");
    },
    onError: (error: Error) => {
      console.error("Error creating versus pair:", error);
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

  return (
    <Card className={className}>
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
  );
}





