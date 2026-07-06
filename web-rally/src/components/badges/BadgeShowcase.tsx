import { motion } from "framer-motion";
import { useBadgeShowcase } from "@/hooks/useBadges";
import { getBadgeDisplay } from "@/lib/badges";

interface BadgeShowcaseProps {
  readonly teamId: number;
}

/**
 * Full "Conquistas" board, data-driven from the DB badge catalogue: every
 * active badge is rendered as a card, earned ones in full colour with their
 * award time, locked ones dimmed with "Por conquistar". Tops the grid with a
 * count chip + progress bar.
 */
export function BadgeShowcase({ teamId }: BadgeShowcaseProps) {
  const { data, isLoading, isError } = useBadgeShowcase(teamId);

  if (isLoading || isError || !data) return null;

  const { definitions, earned } = data;

  // Earliest award time per code → shown on the card.
  const earnedByCode = new Map<string, string>();
  for (const b of earned) {
    const prev = earnedByCode.get(b.code);
    if (!prev || b.awarded_at < prev) {
      earnedByCode.set(b.code, b.awarded_at);
    }
  }

  const total = definitions.length;
  const earnedCount = definitions.filter((d) => earnedByCode.has(d.code)).length;
  const pct = total ? Math.round((earnedCount / total) * 100) : 0;

  return (
    <section className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="rally-accent text-xs font-bold uppercase tracking-[0.2em]">
            Conquistas
          </span>
          <h2 className="rally-display mt-1 text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[34px]">
            Badges
          </h2>
        </div>
        <div className="rally-surface shrink-0 rounded-[14px] px-[18px] py-[12px] text-center">
          <div className="rally-display text-[26px] font-bold leading-none text-foreground">
            {earnedCount}
            <span className="ml-1 text-[16px] text-muted-foreground">/{total}</span>
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Conquistadas
          </div>
        </div>
      </div>

      {/* progress bar */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm font-bold text-foreground">Progresso de conquistas</span>
          <span className="rally-display rally-accent text-sm font-bold">{pct}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="rally-bg-accent h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {/* grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {definitions.map((defn) => {
          const { label, description, color, glyph, iconUrl } = getBadgeDisplay(defn);
          const awardedRaw = earnedByCode.get(defn.code);
          const isEarned = awardedRaw != null;
          const awardedAt = awardedRaw
            ? new Date(awardedRaw).toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null;

          return (
            <div
              key={defn.code}
              className="rounded-[18px] border border-border bg-card p-[22px] transition-opacity"
              style={{
                opacity: isEarned ? 1 : 0.5,
                boxShadow: isEarned ? `0 10px 28px -14px ${color}55` : "none",
              }}
            >
              <div className="flex items-start gap-4">
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt=""
                    aria-hidden
                    className="h-[60px] w-[60px] shrink-0 rounded-[18px] object-cover"
                    style={{ opacity: isEarned ? 1 : 0.5 }}
                  />
                ) : (
                  <div
                    className="grid shrink-0 place-items-center rounded-[18px] text-[28px] text-white"
                    style={{
                      height: 60,
                      width: 60,
                      background: color,
                      opacity: isEarned ? 1 : 0.4,
                    }}
                    aria-hidden
                  >
                    {glyph}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-bold text-foreground">{label}</div>
                  <p className="mb-[10px] mt-[5px] text-[13px] leading-[1.45] text-muted-foreground">
                    {description}
                  </p>
                  <span className="rally-display text-[13px] font-bold">
                    <span className={isEarned ? "rally-accent" : "text-muted-foreground"}>
                      {awardedAt ?? "Por conquistar"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default BadgeShowcase;
