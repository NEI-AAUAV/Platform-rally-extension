import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Team {
  id: number;
  name: string;
  total: number;
  classification: number;
}

interface TeamSelectorProps {
  teams: Team[] | undefined;
  selectedTeam: string;
  onTeamChange: (value: string) => void;
  className?: string;
}

export default function TeamSelector({ teams, selectedTeam, onTeamChange, className = "" }: TeamSelectorProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Selecionar Equipa</CardTitle>
        <CardDescription>
          Escolha uma equipa para gerir os seus membros
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="team-select">Equipa</Label>
          <Select value={selectedTeam} onValueChange={onTeamChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar equipa" />
            </SelectTrigger>
            <SelectContent>
              {teams?.map((team: Team) => (
                <SelectItem key={team.id} value={team.id.toString()}>
                  {team.name} ({team.total} pontos)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
