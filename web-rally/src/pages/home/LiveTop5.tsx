import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { getTeams } from "@/client";
import useScoreboardStream from "@/hooks/useScoreboardStream";
import useRallySettings from "@/hooks/useRallySettings";
import { useCountdown } from "@/pages/home/useCountdown";
import { FreshnessIndicator } from "@/components/shared";
import { sortTeamsByRank } from "@/lib/teamRanking";
import SectionHeader from "./SectionHeader";

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
 * Live top-5 leaderboard for the homepage; the leader gets a highlighted row.
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

  if (!top || top.length === 0) return null;

  return (
    <section aria-labelledby="top5-heading">
      <SectionHeader
        id="top5-heading"
        eyebrow="Ao vivo"
        title="Classificação"
        action={
          <>
            <FreshnessIndicator updatedAt={dataUpdatedAt} />
            <Link
              to="/scoreboard"
              className="rally-accent inline-flex items-center gap-1.5 rounded-md text-xs font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-current" />
              <span>LIVE</span>
            </Link>
          </>
        }
      />

      <motion.ol
        layout
        className="overflow-hidden rounded-[22px] border border-border bg-card"
      >
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
                className={[
                  "flex items-center gap-4 border-b border-border px-5 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
                  index === 0 ? "rally-bg-accent-soft py-5" : "py-3.5",
                ].join(" ")}
              >
                <span
                  className={[
                    "rally-display w-7 text-center font-bold tabular-nums",
                    index === 0 ? "rally-accent text-[28px]" : "text-[18px] text-muted-foreground",
                  ].join(" ")}
                >
                  {index + 1}
                </span>
                <span
                  className={[
                    "grid shrink-0 place-items-center rounded-full font-bold",
                    index === 0
                      ? "rally-bg-accent h-11 w-11 text-sm text-white"
                      : "h-9 w-9 bg-muted text-xs text-foreground",
                  ].join(" ")}
                >
                  {initialsOf(team.name)}
                </span>
                <span
                  className={[
                    "min-w-0 flex-1 truncate font-semibold text-foreground",
                    index === 0 ? "text-base" : "text-sm",
                  ].join(" ")}
                >
                  {team.name}
                </span>
                <span
                  className={[
                    "rally-display font-bold tabular-nums text-foreground",
                    index === 0 ? "text-[24px]" : "text-[17px]",
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
