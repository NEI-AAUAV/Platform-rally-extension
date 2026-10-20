import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { getTeams } from "@/client";
import useScoreboardStream from "@/hooks/useScoreboardStream";
import useRallySettings from "@/hooks/useRallySettings";
import { useCountdown } from "@/pages/home/useCountdown";
import { FreshnessIndicator } from "@/components/shared";
import { sortTeamsByRank } from "@/lib/teamRanking";
import { cn } from "@/lib/utils";

/**
 * Live top-5 for the homepage: the leader on an accent slab, the chasers in a
 * list with a bar measured against the leading score.
 * Shares the ["teams"] query cache with the scoreboard page.
 */
export function LiveTop5() {
  useScoreboardStream([["teams"]]);
  const { settings } = useRallySettings();
  const { phase } = useCountdown(settings?.rally_start_time, settings?.rally_end_time);
  const isProvisional = phase === "live";
  const { data: teams, dataUpdatedAt } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
  });

  const top = Array.isArray(teams) ? sortTeamsByRank(teams).slice(0, 5) : undefined;

  const [leader, ...rest] = top ?? [];
  if (!leader) return null;

  const best = Math.max(leader.total ?? 0, 1);

  return (
    <section aria-labelledby="top5-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 id="top5-heading" className="rally-display text-5xl text-foreground sm:text-6xl">
          Classificação ao vivo
        </h2>
        <div className="flex items-center gap-3">
          <FreshnessIndicator updatedAt={dataUpdatedAt} />
          <Link
            to="/scoreboard"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground hover:underline"
          >
            Ver tudo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <Link
          to="/teams/$id"
          params={{ id: String(leader.id) }}
          className="rally-bg-accent rally-press relative flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-[28px] p-6 text-white sm:p-8"
        >
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Em 1.º lugar
          </span>
          <span
            aria-hidden
            className="rally-display pointer-events-none absolute -bottom-10 right-2 text-[16rem] opacity-15"
          >
            1
          </span>
          <div className="relative">
            <p className="rally-display text-5xl sm:text-6xl">{leader.name}</p>
            <p className="rally-display mt-1 text-4xl sm:text-5xl">
              <span className={cn(isProvisional && "italic")}>{leader.total}</span> pts
            </p>
          </div>
        </Link>

        <motion.ol layout className="rally-surface flex flex-col p-2">
          <AnimatePresence initial={false}>
            {rest.map((team, i) => (
              <motion.li
                key={team.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className={cn(i > 0 && "border-t border-border/70")}
              >
                <Link
                  to="/teams/$id"
                  params={{ id: String(team.id) }}
                  className="flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors hover:bg-accent"
                >
                  <span className="rally-display w-8 text-3xl tabular-nums text-muted-foreground">
                    {i + 2}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                    {team.name}
                  </span>
                  <span
                    aria-hidden
                    className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-secondary sm:block"
                  >
                    <span
                      className="rally-bg-accent block h-full rounded-full"
                      style={{ width: `${Math.max(0, ((team.total ?? 0) / best) * 100)}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "rally-num w-12 text-right text-lg font-bold tabular-nums text-foreground",
                      isProvisional && "italic",
                    )}
                  >
                    {team.total}
                  </span>
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ol>
      </div>
    </section>
  );
}

export default LiveTop5;
