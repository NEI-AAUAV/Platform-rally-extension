import type { ListingTeam } from "@/client";
import { EvaluationTeamCard, type TeamCardVariant } from "./EvaluationTeamCard";
import { cn } from "@/lib/utils";

const LABEL_CLASS: Record<TeamCardVariant, string> = {
  current: "text-foreground",
  // amber-800, not amber-600: at this size and weight amber-600 is 3.05:1 on
  // the light surface, a serious WCAG AA contrast failure the a11y suite
  // catches now that the "postos anteriores" section actually renders. The
  // darker step is picked against the *tinted* ground the nei theme paints
  // behind this label (#d3e7db, where amber-700 is still only 3.88:1), not
  // just the off-white one.
  previous: "text-amber-800 dark:text-amber-400",
  evaluated: "text-muted-foreground",
};

interface TeamSectionProps {
  title: string;
  variant: TeamCardVariant;
  teams: ListingTeam[];
  showScore: boolean;
  onSelect: (team: ListingTeam) => void;
}

export function TeamSection({
  title,
  variant,
  teams,
  showScore,
  onSelect,
}: Readonly<TeamSectionProps>) {
  if (teams.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h3 className={cn("rally-display text-2xl", LABEL_CLASS[variant])}>{title}</h3>
        <span className="rally-num text-sm font-bold text-muted-foreground">{teams.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
    </section>
  );
}
