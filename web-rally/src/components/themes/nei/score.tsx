import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { NEIBadge } from "./badge";
import { NEIButton } from "./button";
import type { ListingTeam } from "@/client";
import { Link } from "react-router-dom";
import { formatTime } from "@/utils/timeFormat";

/**
 * NEI Theme Score Component
 * 
 * Team score display using NEI brand color (#008542)
 */

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

export function NEIScore({ className, team, ...props }: ScoreProps) {
  const lastCheckpointTime =
    team.last_checkpoint_time && new Date(team.last_checkpoint_time);
  
  // Use the actual checkpoint number if available, otherwise fall back to completed checkpoints count
  const checkpointNumber = team.last_checkpoint_number || team.times?.length || 0;
  
  return (
    <div
      {...props}
      className={cn(
        "grid place-items-center gap-4 self-stretch rounded-2xl border-2 px-4 py-8",
        {
          "border-[#008542]/50 bg-[rgb(255,255,255,0.15)]":
            team.classification === 1,
          "border-[#008542]/20 bg-[rgb(255,255,255,0.04)]":
            team.classification !== 1,
        },
        className,
      )}
    >
      <NEIBadge
        className="flex w-14 justify-center px-8 py-2 text-lg font-bold"
        variant={variantClassification(team.classification)}
      >
        {team.classification}
        {nthNumber(team.classification)}
      </NEIBadge>

      <span className="grow text-center text-2xl font-bold">{team.name}</span>
      <span className="grow text-center">
        {checkpointNumber > 0 ? (
          <div className="space-y-1">
            <div className="text-xs text-white/50">
              {team.last_checkpoint_name || `Checkpoint #${checkpointNumber}`}
            </div>
            <div className="text-sm font-medium text-white/60">
              {team.last_checkpoint_score || 0}pts
            </div>
            {lastCheckpointTime && (
              <div className="text-xs text-white/50">
                {formatTime(lastCheckpointTime)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-white/60">No checkpoints yet</div>
        )}
      </span>
      <span className="grow text-center text-4xl font-bold text-white">
        {team.total}pts
      </span>
      <Link to={`/teams/${team.id}`}>
        <NEIButton variant={"primary"}>
          View Team
        </NEIButton>
      </Link>
    </div>
  );
}

// Keep default export for backward compatibility
export default NEIScore;

