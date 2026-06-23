import { Badge } from "@/components/ui/badge";
import type { ListingTeam } from "@/client";

export type TeamCardVariant = "current" | "previous" | "evaluated";

interface VariantStyle {
  container: string;
  badgeLabel: string;
  badgeClass: string;
}

const VARIANTS: Record<TeamCardVariant, VariantStyle> = {
  current: {
    container:
      "border-green-500/30 bg-green-500/10 hover:bg-green-500/20 transition-colors",
    badgeLabel: "Current",
    badgeClass: "text-green-600 border-green-600 text-xs",
  },
  previous: {
    container:
      "border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors",
    badgeLabel: "Previous",
    badgeClass: "text-yellow-600 border-yellow-600 text-xs",
  },
  evaluated: {
    container: "opacity-75 hover:opacity-90 transition-opacity",
    badgeLabel: "✓ Evaluated",
    badgeClass: "text-green-600 border-green-600 text-xs",
  },
};

interface EvaluationTeamCardProps {
  team: ListingTeam;
  variant: TeamCardVariant;
  showScore: boolean;
  onSelect: (team: ListingTeam) => void;
}

export function EvaluationTeamCard({ team, variant, showScore, onSelect }: EvaluationTeamCardProps) {
  const style = VARIANTS[variant];

  return (
    <div
      className={`p-3 sm:p-4 rounded-lg border cursor-pointer ${style.container}`}
      onClick={() => onSelect(team)}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold">{team.name}</h4>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={style.badgeClass}>
            {style.badgeLabel}
          </Badge>
          <Badge variant="outline">#{team.id}</Badge>
        </div>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Members: {team.num_members || 0}</p>
        {showScore && <p>Total Score: {team.total || 0}</p>}
        {showScore && <p>Classification: {team.classification || "N/A"}</p>}
        <p>Last Checkpoint: {team.last_checkpoint_number || "None"}</p>
      </div>
    </div>
  );
}
