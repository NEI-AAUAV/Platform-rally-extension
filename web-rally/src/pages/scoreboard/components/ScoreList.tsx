import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import type { ListingTeam } from "@/client";

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function reachedOf(team: ListingTeam): number {
  return (
    team.last_checkpoint_number ??
    team.current_checkpoint_number ??
    team.times?.length ??
    0
  );
}

const MEDAL_RING = ["ring-amber-400", "ring-zinc-400", "ring-amber-700"];
const ORDINAL = ["1º", "2º", "3º"];

/**
 * Podium for the top three teams: the leader sits centre and elevated, the
 * runners-up flank it. Soft-depth, accent-tinted — the rally analogue of the
 * gamification leaderboard podium.
 */
export function Podium({
  teams,
  checkpointsCount,
}: {
  readonly teams: ListingTeam[];
  readonly checkpointsCount?: number;
}) {
  // visual order: 2nd, 1st, 3rd
  const order: Array<{ team: ListingTeam; rank: number }> = [];
  if (teams[1]) order.push({ team: teams[1], rank: 2 });
  if (teams[0]) order.push({ team: teams[0], rank: 1 });
  if (teams[2]) order.push({ team: teams[2], rank: 3 });
  if (order.length === 0) return null;

  return (
    <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
      {order.map(({ team, rank }) => {
        const champion = rank === 1;
        const reached = reachedOf(team);
        return (
          <Link
            key={team.id}
            to="/teams/$id"
            params={{ id: String(team.id) }}
            className={[
              "rally-press flex flex-col items-center rounded-2xl border border-border p-4 text-center",
              champion
                ? "rally-bg-accent-soft rally-shadow-accent sm:-translate-y-3 sm:p-6"
                : "bg-card",
            ].join(" ")}
          >
            <span className="rally-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {ORDINAL[rank - 1]}
            </span>
            <div
              className={[
                "mt-2 grid place-items-center rounded-full bg-card ring-2",
                MEDAL_RING[rank - 1],
                champion ? "h-20 w-20 sm:h-24 sm:w-24" : "h-14 w-14 sm:h-16 sm:w-16",
              ].join(" ")}
            >
              {champion ? (
                <span className="rally-display rally-accent text-[28px] font-bold sm:text-[34px]">★</span>
              ) : (
                <span className="rally-display text-base font-bold text-foreground sm:text-lg">
                  {initialsOf(team.name)}
                </span>
              )}
            </div>
            <p
              className={[
                "mt-3 max-w-full truncate font-semibold text-foreground",
                champion ? "text-base sm:text-lg" : "text-sm",
              ].join(" ")}
            >
              {team.name}
            </p>
            <p className="rally-display rally-accent mt-1 text-xl font-bold tabular-nums sm:text-2xl">
              {team.total}
              <span className="ml-1 text-xs font-medium text-muted-foreground">pts</span>
            </p>
            {reached > 0 && (
              <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                {checkpointsCount ? `${reached}/${checkpointsCount} postos` : `Posto ${reached}`}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Ranked rows for the teams below the podium (or the whole list in restricted
 * single-team mode). Animates in place as the live stream reorders the cache.
 */
export function ScoreRows({
  teams,
  startRank = 1,
  checkpointsCount,
}: {
  readonly teams: ListingTeam[];
  readonly startRank?: number;
  readonly checkpointsCount?: number;
}) {
  if (teams.length === 0) return null;

  return (
    <motion.ol layout className="grid gap-2">
      <AnimatePresence initial={false}>
        {teams.map((team, i) => {
          const rank = startRank + i;
          const reached = reachedOf(team);
          return (
            <motion.li
              key={team.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            >
              <Link
                to="/teams/$id"
                params={{ id: String(team.id) }}
                className="rally-surface rally-press flex items-center gap-4 px-4 py-3.5"
              >
                <span className="rally-display w-7 shrink-0 text-center text-xl font-bold tabular-nums text-muted-foreground">
                  {rank}
                </span>
                <span className="rally-bg-accent-soft rally-accent grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold">
                  {initialsOf(team.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">
                    {team.name}
                  </span>
                  {reached > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {checkpointsCount ? `${reached}/${checkpointsCount} postos` : `Posto ${reached}`}
                    </span>
                  )}
                </span>
                <span className="rally-display shrink-0 text-lg font-bold tabular-nums text-foreground">
                  {team.total}
                  <span className="ml-1 text-xs font-medium text-muted-foreground">pts</span>
                </span>
              </Link>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ol>
  );
}
