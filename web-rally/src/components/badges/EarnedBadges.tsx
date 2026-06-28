import { motion } from "framer-motion";
import { useTeamBadges } from "@/hooks/useBadges";
import { getBadgeDisplay } from "@/lib/badges";

interface EarnedBadgesProps {
  teamId: number;
}

export function EarnedBadges({ teamId }: EarnedBadgesProps) {
  const { data: badges, isLoading, isError } = useTeamBadges(teamId);

  if (isLoading || isError || !badges || badges.length === 0) return null;

  const earned = badges.length;

  return (
    <section className="space-y-5">
      {/* header row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] rally-accent">
            Conquistas
          </span>
          <h2 className="rally-display mt-1 text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[34px]">
            Badges
          </h2>
        </div>
        <div className="rally-surface px-[18px] py-[12px] rounded-[14px] text-center shrink-0">
          <div className="rally-display text-[26px] font-bold text-foreground leading-none">
            {earned}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mt-1">
            Conquistadas
          </div>
        </div>
      </div>

      {/* badge cards grid */}
      <motion.div
        className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        {badges.map((badge) => {
          const { label, description, color, glyph } = getBadgeDisplay(badge.badge_type);
          const awardedAt = badge.awarded_at
            ? new Date(badge.awarded_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
            : null;

          return (
            <motion.div
              key={badge.id}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              className="rounded-[18px] border border-border bg-card p-[22px]"
              style={{ boxShadow: `0 10px 28px -14px ${color}55` }}
            >
              <div className="flex items-start gap-4">
                {/* glyph circle */}
                <div
                  className="grid shrink-0 place-items-center rounded-[18px] text-[28px] text-white"
                  style={{ height: 60, width: 60, background: color }}
                  aria-hidden
                >
                  {glyph}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[16px] text-foreground">{label}</div>
                  <p className="text-[13px] text-muted-foreground mt-[5px] mb-[10px] leading-[1.45]">
                    {description}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rally-display text-[13px] font-bold rally-accent">
                      {awardedAt ?? "Por conquistar"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
