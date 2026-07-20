interface SkeletonProps {
  className?: string;
}

/**
 * Layout-stable loading placeholder. Pulses opacity (compositor-friendly)
 * and respects prefers-reduced-motion via `motion-reduce:animate-none`.
 */
export default function Skeleton({ className = "" }: Readonly<SkeletonProps>) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-muted motion-reduce:animate-none ${className}`}
    />
  );
}
