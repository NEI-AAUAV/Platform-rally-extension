import { Trophy } from "lucide-react";
import type { ListingTeam } from "@/client";

interface LeaderboardHeaderProps {
  readonly leader: ListingTeam;
  readonly teamsCount: number;
  /** Total checkpoints, when known (the count query may be unavailable publicly). */
  readonly checkpointsCount?: number;
}

/**
 * Bento header above the ranked list: highlights the leader and a couple of
 * at-a-glance stats. Purely presentational; the full ranking renders below.
 */
export default function LeaderboardHeader({ leader, teamsCount, checkpointsCount }: LeaderboardHeaderProps) {
  const reached = leader.last_checkpoint_number ?? leader.current_checkpoint_number ?? leader.times?.length ?? 0;
  const progress = checkpointsCount && checkpointsCount > 0 ? Math.min(100, Math.round((reached / checkpointsCount) * 100)) : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* leader hero */}
      <div className="rally-bg-accent-soft col-span-2 flex flex-col justify-between rounded-2xl border border-white/12 p-5 sm:row-span-2 sm:min-h-[220px]">
        <div>
          <span className="rally-bg-accent inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white">
            <Trophy className="h-3.5 w-3.5" />
            1º Lugar
          </span>
          <div className="rally-display mt-3 text-3xl font-bold text-white sm:text-4xl">{leader.name}</div>
          {reached > 0 && (
            <div className="mt-1 text-sm text-white/60">
              {checkpointsCount ? `${reached} / ${checkpointsCount} checkpoints` : `Checkpoint ${reached}`}
            </div>
          )}
        </div>
        <div className="mt-4">
          <div className="rally-display rally-accent text-4xl font-bold">
            {leader.total}
            <span className="ml-1 text-base font-medium text-white/60">pts</span>
          </div>
          {progress !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="rally-bg-accent h-full rounded-full" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
        <div className="text-xs uppercase tracking-[0.12em] text-white/60">Equipas</div>
        <div className="rally-display mt-1 text-3xl font-bold text-white">{teamsCount}</div>
      </div>

      <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
        <div className="text-xs uppercase tracking-[0.12em] text-white/60">
          {checkpointsCount ? "Checkpoints" : "Pontos do líder"}
        </div>
        <div className="rally-display mt-1 text-3xl font-bold text-white">{checkpointsCount ?? leader.total}</div>
      </div>
    </div>
  );
}
