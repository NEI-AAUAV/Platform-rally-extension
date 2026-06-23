import type { ListingTeam } from "@/client";
import { EvaluationTeamCard, type TeamCardVariant } from "./EvaluationTeamCard";

type Accent = "green" | "yellow" | "gray";

// Full literal class names so Tailwind's JIT can detect them.
const DIVIDER: Record<Accent, string> = {
  green: "bg-green-500/30",
  yellow: "bg-yellow-500/30",
  gray: "bg-gray-500/30",
};

const LABEL: Record<Accent, string> = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  gray: "text-gray-600",
};

interface TeamSectionProps {
  title: string;
  accent: Accent;
  variant: TeamCardVariant;
  teams: ListingTeam[];
  showScore: boolean;
  onSelect: (team: ListingTeam) => void;
}

export function TeamSection({ title, accent, variant, teams, showScore, onSelect }: TeamSectionProps) {
  if (teams.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-px flex-1 ${DIVIDER[accent]}`}></div>
        <span className={`text-sm font-medium px-2 ${LABEL[accent]}`}>{title}</span>
        <div className={`h-px flex-1 ${DIVIDER[accent]}`}></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
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
