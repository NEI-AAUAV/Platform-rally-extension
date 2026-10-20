import Skeleton from "./Skeleton";

type LoadingVariant = "page" | "list" | "block";

interface LoadingStateProps {
  /** Announced to screen readers; never rendered visibly. */
  message?: string;
  className?: string;
  /**
   * `page`: heading + card grid, for full-page loads.
   * `list`: stacked rows, for lists/tables inside a page.
   * `block`: a single card-sized placeholder, for small panels.
   */
  variant?: LoadingVariant;
}

const ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;
const CARD_KEYS = ["c1", "c2", "c3"] as const;

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARD_KEYS.map((key) => (
          <Skeleton key={key} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {ROW_KEYS.map((key) => (
        <Skeleton key={key} className="h-16 rounded-2xl" />
      ))}
    </div>
  );
}

const VARIANTS: Record<LoadingVariant, () => React.JSX.Element> = {
  page: PageSkeleton,
  list: ListSkeleton,
  block: () => <Skeleton className="h-24 rounded-2xl" />,
};

export default function LoadingState({
  message = "A carregar...",
  className = "",
  variant = "page",
}: Readonly<LoadingStateProps>) {
  const Placeholder = VARIANTS[variant];
  return (
    <div role="status" aria-busy="true" className={`py-4 ${className}`}>
      <span className="sr-only">{message}</span>
      <Placeholder />
    </div>
  );
}
