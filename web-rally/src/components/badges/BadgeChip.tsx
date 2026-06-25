import { motion } from "framer-motion";
import { getBadgeDisplay } from "@/lib/badges";
import { cn } from "@/lib/utils";

interface BadgeChipProps {
  badgeType: string;
  awardedAt?: string;
  className?: string;
}

/**
 * A single earned badge, rendered in the NEI neo-brutalist language: bold accent
 * border, hard offset shadow, uppercase label.
 */
export function BadgeChip({ badgeType, awardedAt, className }: BadgeChipProps) {
  const { label, description, Icon } = getBadgeDisplay(badgeType);
  const title = awardedAt
    ? `${description}\nAtribuído em ${new Date(awardedAt).toLocaleDateString("pt-PT")}`
    : description;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      whileHover={{ y: -2 }}
      title={title}
      className={cn(
        "rally-brutal-sm rally-accent flex w-24 flex-col items-center gap-2 bg-white/[0.03] px-3 py-3 text-center",
        className,
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={2.25} />
      <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-white">
        {label}
      </span>
    </motion.div>
  );
}
