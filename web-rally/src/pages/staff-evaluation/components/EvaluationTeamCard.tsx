import type { ListingTeam } from "@/client";
import { cn } from "@/lib/utils";

export type TeamCardVariant = "current" | "previous" | "evaluated";

interface VariantConfig {
  label: string;
  cardClass: string;
  badgeClass: string;
}

const VARIANTS: Record<TeamCardVariant, VariantConfig> = {
  current: {
    label: "Em curso",
    cardClass: "rally-border-accent border-2 bg-card",
    badgeClass: "rally-bg-accent text-white",
  },
  previous: {
    label: "Anterior",
    cardClass: "border border-amber-500/40 bg-card",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  evaluated: {
    label: "Avaliado",
    cardClass: "border border-border/70 bg-card/60 dark:border-transparent",
    badgeClass: "rally-bg-accent-soft text-foreground",
  },
};

interface EvaluationTeamCardProps {
  team: ListingTeam;
  variant: TeamCardVariant;
  showScore: boolean;
  onSelect: (team: ListingTeam) => void;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function EvaluationTeamCard({
  team,
  variant,
  showScore,
  onSelect,
}: Readonly<EvaluationTeamCardProps>) {
  const cfg = VARIANTS[variant];

  return (
    <button
      type="button"
      onClick={() => onSelect(team)}
      className={cn(
        "rally-press flex w-full cursor-pointer items-center gap-4 rounded-3xl p-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        cfg.cardClass,
      )}
    >
      <span className="rally-bg-accent-soft rally-display grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl text-foreground">
        {initialsOf(team.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="rally-display truncate text-2xl text-foreground">{team.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {team.num_members || 0} membros
          {showScore && ` · ${team.total || 0} pts`}
          {` · ${team.resolved_checkpoint_orders?.length ?? 0} postos resolvidos`}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
          cfg.badgeClass,
        )}
      >
        {cfg.label}
      </span>
    </button>
  );
}
