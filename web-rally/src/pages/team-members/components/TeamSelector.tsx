import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ListingTeam } from "@/client";

type TeamSelectorProps = Readonly<{
  teams: ListingTeam[] | undefined;
  selectedTeam: string;
  onTeamChange: (value: string) => void;
  className?: string;
}>

export default function TeamSelector({ teams, selectedTeam, onTeamChange, className }: TeamSelectorProps) {
  return (
    <div className={cn("rally-surface rounded-2xl p-6", className)}>
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-1 text-foreground">Selecionar Equipa</h2>
        <p className="text-sm text-muted-foreground">Escolha uma equipa para gerir os seus membros</p>
      </div>
      <div className="space-y-3">
        <Label htmlFor="team-select">Equipa</Label>
        <Select value={selectedTeam} onValueChange={onTeamChange}>
          <SelectTrigger id="team-select" className="bg-muted border-border">
            <SelectValue placeholder="Selecionar equipa" />
          </SelectTrigger>
          <SelectContent>
            {teams?.map((team) => (
              <SelectItem key={team.id} value={team.id.toString()}>
                {team.name} ({team.num_members} membros)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
