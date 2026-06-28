import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { TeamService, type ListingTeam } from "@/client";
import useScoreboardStream from "@/hooks/useScoreboardStream";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Compact live top-5 leaderboard card for the homepage.
 * Shares the ["teams"] query cache with the scoreboard page.
 */
export function LiveTop5() {
  useScoreboardStream([["teams"]]);
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
  });

  const top = teams
    ? [...teams]
        .sort((a: ListingTeam, b: ListingTeam) => a.classification - b.classification)
        .slice(0, 5)
    : undefined;

  if (!top || top.length === 0) return null;

  return (
    <section aria-labelledby="top5-heading" className="p-[22px] rounded-[20px] bg-card border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2
          id="top5-heading"
          className="rally-display text-xl font-bold text-foreground"
        >
          Classificação ao vivo
        </h2>
        <Link
          to="/scoreboard"
          className="inline-flex items-center gap-1.5 text-xs font-bold rally-accent"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-current animate-pulse" />
          LIVE
        </Link>
      </div>

      <motion.ol layout className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {top.map((team, index) => (
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
                className="flex items-center gap-3.5 px-[13px] py-[11px] rounded-[13px] bg-muted/30 border border-transparent hover:border-border transition-colors cursor-pointer"
              >
                <span className="rally-display w-[22px] text-center text-[18px] font-bold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="grid place-items-center h-[38px] w-[38px] rounded-full rally-bg-accent-soft rally-accent font-bold text-[13px] shrink-0">
                  {initialsOf(team.name)}
                </span>
                <span className="flex-1 min-w-0 font-semibold text-sm text-foreground truncate">
                  {team.name}
                </span>
                <span className="rally-display font-bold text-[17px] tabular-nums text-foreground">
                  {team.total}
                </span>
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ol>
    </section>
  );
}

export default LiveTop5;
