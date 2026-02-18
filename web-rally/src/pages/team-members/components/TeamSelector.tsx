import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import type { ListingTeam } from "@/client";

interface TeamSelectorProps {
  teams: ListingTeam[] | undefined;
  selectedTeam: string;
  onTeamChange: (value: string) => void;
  className?: string;
}

export default function TeamSelector({
  teams,
  selectedTeam,
  onTeamChange,
  className = "",
}: TeamSelectorProps) {
  const components = useThemedComponents();
  const { Card, config } = components;

  return (
    <Card className={`p-6 border-opacity-50 shadow-lg backdrop-blur-md ${className}`}>
      <div className="mb-4">
        <h2
          className="text-xl font-bold mb-1"
          style={{ color: config?.colors?.text }}
        >
          Selecionar Equipa
        </h2>
        <p className="text-sm opacity-70" style={{ color: config?.colors?.text }}>
          Escolha uma equipa para gerir os seus membros
        </p>
      </div>

      <div className="space-y-3">
        <Label
          htmlFor="team-select"
          style={{ color: config?.colors?.text }}
        >
          Equipa
        </Label>
        <Select value={selectedTeam} onValueChange={onTeamChange}>
          <SelectTrigger
            id="team-select"
            className="bg-black/10 border-white/10"
            style={{ color: config?.colors?.text }}
          >
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
    </Card>
  );
}
