import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { RallyBadge } from "./badge";
import { RallyButton } from "./button";
import type { ListingTeam } from "@/client";
import { Link } from "@tanstack/react-router";
import { formatTime } from "@/utils/timeFormat";

type ScoreProps = { team: ListingTeam } & ComponentProps<"div">;

const nthNumber = (number: number) => {
  if (number > 3 && number < 21) return "th";
  switch (number % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

const variantClassification = (classification: number) => {
  switch (classification) {
    case 1:
      return "primary";
    case 2:
    case 3:
      return "default";
    default:
      return "neutral";
  }
};

/** Team score card on the design tokens; the leader is highlighted with the accent. */
export function RallyScore({ className, team, ...props }: ScoreProps) {
  const lastCheckpointTime =
    team.last_checkpoint_time && new Date(team.last_checkpoint_time);

  const checkpointNumber = team.last_checkpoint_number || team.times?.length || 0;
  const isLeader = team.classification === 1;

  return (
    <div
      {...props}
      className={cn(
        "grid place-items-center gap-4 self-stretch rounded-2xl border px-4 py-8",
        isLeader
          ? "rally-border-accent rally-bg-accent-soft shadow-[var(--rally-shadow-md)]"
          : "border-border bg-card shadow-[var(--rally-shadow-sm)]",
        className,
      )}
    >
      <RallyBadge
        className="flex w-14 justify-center px-8 py-2 text-lg font-bold"
        variant={variantClassification(team.classification)}
      >
        {team.classification}
        {nthNumber(team.classification)}
      </RallyBadge>

      <span className="grow text-center text-2xl font-bold text-foreground">{team.name}</span>
      <span className="grow text-center">
        {checkpointNumber > 0 ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              {team.last_checkpoint_name || `Checkpoint #${checkpointNumber}`}
            </div>
            <div className="text-sm font-medium text-foreground/80">
              {team.last_checkpoint_score || 0}pts
            </div>
            {lastCheckpointTime && (
              <div className="text-xs text-muted-foreground">
                {formatTime(lastCheckpointTime)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Sem postos ainda</div>
        )}
      </span>
      <span className="rally-display grow text-center text-4xl font-bold text-foreground">
        {team.total}pts
      </span>
      <Link to="/teams/$id" params={{ id: String(team.id) }}>
        <RallyButton variant="primary">Ver Equipa</RallyButton>
      </Link>
    </div>
  );
}

export default RallyScore;
