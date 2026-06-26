import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { TeamService, type ListingTeam } from "@/client";
import useScoreboardStream from "@/hooks/useScoreboardStream";

const MEDAL = ["text-amber-400", "text-zinc-400", "text-amber-700"];

/**
 * Compact, live top-5 leaderboard for the homepage. Shares the `["teams"]`
 * query cache with the full scoreboard and the SSE stream, so it updates in
 * place. Renders nothing until there is more than one team to rank.
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

  if (!top || top.length < 2) return null;

  return (
    <section aria-labelledby="top5-heading">
      <div className="flex items-center justify-between">
        <h2
          id="top5-heading"
          className="rally-display text-2xl font-bold text-foreground sm:text-3xl"
        >
          Ao vivo
        </h2>
        <Link
          to="/scoreboard"
          className="rally-accent inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          Ver tudo
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <motion.ol layout className="mt-5 grid gap-2">
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
                className="rally-surface rally-press flex items-center gap-4 px-4 py-3"
              >
                <span
                  className={`rally-display w-8 text-center text-2xl font-bold tabular-nums ${
                    MEDAL[index] ?? "text-muted-foreground/50"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                  {team.name}
                </span>
                <span className="rally-display text-lg font-bold tabular-nums text-foreground">
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
