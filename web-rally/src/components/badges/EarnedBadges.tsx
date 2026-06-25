import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { useTeamBadges } from "@/hooks/useBadges";
import { BadgeChip } from "./BadgeChip";

interface EarnedBadgesProps {
  teamId: number;
}

/** Section listing the badges a team has earned. Hidden while empty/loading. */
export function EarnedBadges({ teamId }: EarnedBadgesProps) {
  const { data: badges, isLoading, isError } = useTeamBadges(teamId);

  if (isLoading || isError || !badges || badges.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <Trophy className="rally-accent h-6 w-6" strokeWidth={2.25} />
        Conquistas
        <span className="rally-accent text-base font-bold">({badges.length})</span>
      </h2>
      <motion.div
        className="flex flex-wrap gap-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.06 } },
        }}
      >
        {badges.map((badge) => (
          <motion.div
            key={badge.id}
            variants={{
              hidden: { opacity: 0, y: 8 },
              show: { opacity: 1, y: 0 },
            }}
          >
            <BadgeChip badgeType={badge.badge_type} awardedAt={badge.awarded_at} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
