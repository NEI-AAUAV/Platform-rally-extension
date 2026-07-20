import { Clock } from "lucide-react";

interface ProvisionalBadgeProps {
  /** Optional custom label; defaults to "Provisório". */
  label?: string;
  className?: string;
}

/**
 * Marks scores that can still change (e.g. while the event is live or
 * deferred judging is pending). Purely presentational.
 */
export default function ProvisionalBadge({
  label = "Provisório",
  className = "",
}: Readonly<ProvisionalBadgeProps>) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-600 dark:text-yellow-300 ${className}`}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}
