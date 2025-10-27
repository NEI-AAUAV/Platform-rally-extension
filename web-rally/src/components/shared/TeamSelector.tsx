import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Team {
  id: number;
  name: string;
  total: number;
  classification: number;
}

interface TeamSelectorProps {
  teams: Team[];
  selectedTeam: string;
  onTeamChange: (teamId: string) => void;
  placeholder?: string;
  label?: string;
  showPoints?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function TeamSelector({
  teams,
  selectedTeam,
  onTeamChange,
  placeholder = "Selecionar equipa",
  label = "Equipa",
  showPoints = true,
  disabled = false,
  className = ""
}: TeamSelectorProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor="team-select">{label}</Label>
      <Select value={selectedTeam} onValueChange={onTeamChange} disabled={disabled}>
        <SelectTrigger id="team-select">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {teams?.map((team) => (
            <SelectItem key={team.id} value={team.id.toString()}>
              {team.name}{showPoints ? ` (${team.total} pontos)` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}










