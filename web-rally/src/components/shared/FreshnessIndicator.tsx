import useDataFreshness from "@/hooks/useDataFreshness";

interface FreshnessIndicatorProps {
  /** Query `dataUpdatedAt` epoch (ms). */
  updatedAt: number;
  className?: string;
}

function relativeLabel(secondsAgo: number): string {
  if (secondsAgo < 5) return "atualizado agora";
  if (secondsAgo < 60) return `atualizado há ${secondsAgo}s`;
  const minutes = Math.floor(secondsAgo / 60);
  return `atualizado há ${minutes}min`;
}

/**
 * Small "atualizado há 12s" indicator for realtime views, with a pulsing dot.
 * Renders nothing until the first successful fetch.
 */
export default function FreshnessIndicator({ updatedAt, className = "" }: Readonly<FreshnessIndicatorProps>) {
  const secondsAgo = useDataFreshness(updatedAt);

  if (secondsAgo === null) return null;

  const isStale = secondsAgo >= 60;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground ${className}`}
      aria-live="polite"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          isStale ? "bg-yellow-500" : "rally-bg-accent animate-pulse motion-reduce:animate-none"
        }`}
      />
      {relativeLabel(secondsAgo)}
    </span>
  );
}
