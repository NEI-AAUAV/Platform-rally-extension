import { Skeleton } from "@/components/shared";

/** Layout-stable placeholder mirroring the team-progress two-column layout. */
export default function TeamProgressSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-6 lg:sticky lg:top-24">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-7 w-40 rounded-md" />
        <div className="space-y-3">
          {["c1", "c2", "c3", "c4", "c5"].map((key) => (
            <Skeleton key={key} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
