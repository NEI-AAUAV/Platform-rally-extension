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
    cardClass: "rally-border-accent rally-bg-accent-soft",
    badgeClass: "rally-bg-accent text-white",
  },
  previous: {
    label: "Anterior",
    cardClass: "border-amber-500/30 bg-amber-500/10",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  evaluated: {
    label: "Avaliado",
    cardClass: "border-border bg-card opacity-75",
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
        "font-inherit flex w-full cursor-pointer items-center gap-4 rounded-xl border border-none bg-transparent p-4 text-left outline-none transition-colors hover:brightness-95",
        cfg.cardClass,
      )}
    >
      <span className="rally-bg-accent-soft text-foreground rally-display grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold">
        {initialsOf(team.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-foreground">{team.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {team.num_members || 0} membros
          {showScore && ` · ${team.total || 0} pts`}
          {` · Posto ${team.last_checkpoint_number || "—"}`}
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
