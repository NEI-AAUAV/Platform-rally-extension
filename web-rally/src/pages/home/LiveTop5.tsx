import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { getTeams, type ListingTeam } from "@/client";
import useScoreboardStream from "@/hooks/useScoreboardStream";
import useRallySettings from "@/hooks/useRallySettings";
import { useCountdown } from "@/pages/home/useCountdown";
import { FreshnessIndicator } from "@/components/shared";

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
  const { settings } = useRallySettings();
  const { phase } = useCountdown(settings?.rally_start_time, settings?.rally_end_time);
  const isProvisional = phase === "live";
  const { data: teams, dataUpdatedAt } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
  });

  const top = teams
    ? [...teams]
        .sort((a: ListingTeam, b: ListingTeam) => a.classification - b.classification)
        .slice(0, 5)
    : undefined;

  if (!top || top.length === 0) return null;

  return (
    <section
      aria-labelledby="top5-heading"
      className="rounded-[20px] border border-border bg-card p-[22px]"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="top5-heading" className="rally-display text-xl font-bold text-foreground">
          Classificação ao vivo
        </h2>
        <div className="flex items-center gap-3">
          <FreshnessIndicator updatedAt={dataUpdatedAt} />
          <Link
            to="/scoreboard"
            className="rally-accent inline-flex items-center gap-1.5 text-xs font-bold"
          >
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-current" />
            LIVE
          </Link>
        </div>
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
                className="flex cursor-pointer items-center gap-3.5 rounded-[13px] border border-transparent bg-muted/30 px-[13px] py-[11px] transition-colors hover:border-border"
              >
                <span className="rally-display w-[22px] text-center text-[18px] font-bold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="rally-bg-accent-soft rally-accent grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-[13px] font-bold">
                  {initialsOf(team.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {team.name}
                </span>
                <span
                  className={[
                    "rally-display text-[17px] font-bold tabular-nums text-foreground",
                    isProvisional ? "italic" : "",
                  ].join(" ")}
                >
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
