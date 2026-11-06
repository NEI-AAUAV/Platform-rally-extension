import Skeleton from "./Skeleton";
import LoadingState from "./LoadingState";

interface AppShellSkeletonProps {
  /** Announced to screen readers; never rendered visibly. */
  message?: string;
}

const NAV_KEYS = ["n1", "n2", "n3"] as const;

/**
 * Full-screen placeholder mirroring the app chrome (navbar + page body), used
 * while the app boots so the first paint already has the final layout shape.
 */
export default function AppShellSkeleton({
  message = "A carregar o Rally...",
}: Readonly<AppShellSkeletonProps>) {
  return (
    <div className="min-h-screen w-full">
      <div className="flex h-16 items-center justify-between gap-4 border-b border-border px-4 sm:px-6">
        <Skeleton className="h-8 w-28" />
        <div className="hidden items-center gap-3 md:flex">
          {NAV_KEYS.map((key) => (
            <Skeleton key={key} className="h-4 w-20" />
          ))}
        </div>
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <LoadingState message={message} />
      </div>
    </div>
  );
}
