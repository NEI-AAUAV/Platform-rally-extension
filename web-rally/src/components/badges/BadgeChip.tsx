import { motion } from "framer-motion";
import { getBadgeDisplay } from "@/lib/badges";
import { cn } from "@/lib/utils";

interface BadgeChipProps {
  badgeType: string;
  awardedAt?: string;
  className?: string;
}

export function BadgeChip({ badgeType, awardedAt, className }: BadgeChipProps) {
  const { label, description, color, glyph } = getBadgeDisplay(badgeType);
  const title = awardedAt
    ? `${description}\nAtribuído em ${new Date(awardedAt).toLocaleDateString("pt-PT")}`
    : description;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      whileHover={{ y: -2 }}
      title={title}
      className={cn(
        "flex items-center gap-2.5 rounded-[12px] border border-border bg-card px-3 py-2.5",
        className,
      )}
    >
      <span
        className="grid shrink-0 place-items-center rounded-[10px] text-[16px] text-white"
        style={{ height: 36, width: 36, background: color }}
        aria-hidden
      >
        {glyph}
      </span>
      <span className="text-[12px] font-bold leading-tight text-foreground">{label}</span>
    </motion.div>
  );
}
