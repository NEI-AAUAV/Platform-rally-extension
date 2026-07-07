import type { ListingTeam } from "@/client";
import { EvaluationTeamCard, type TeamCardVariant } from "./EvaluationTeamCard";
import { cn } from "@/lib/utils";

const DIVIDER_CLASS: Record<TeamCardVariant, string> = {
  current: "rally-bg-accent-soft",
  previous: "bg-amber-500/20",
  evaluated: "bg-border",
};

const LABEL_CLASS: Record<TeamCardVariant, string> = {
  current: "rally-accent",
  previous: "text-amber-600 dark:text-amber-400",
  evaluated: "text-muted-foreground",
};

interface TeamSectionProps {
  title: string;
  variant: TeamCardVariant;
  teams: ListingTeam[];
  showScore: boolean;
  onSelect: (team: ListingTeam) => void;
}

export function TeamSection({ title, variant, teams, showScore, onSelect }: Readonly<TeamSectionProps>) {
  if (teams.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={cn("h-px flex-1", DIVIDER_CLASS[variant])} />
        <span className={cn("text-xs font-bold uppercase tracking-[0.1em]", LABEL_CLASS[variant])}>
          {title}
        </span>
        <div className={cn("h-px flex-1", DIVIDER_CLASS[variant])} />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => (
          <EvaluationTeamCard
            key={team.id}
            team={team}
            variant={variant}
            showScore={showScore}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
