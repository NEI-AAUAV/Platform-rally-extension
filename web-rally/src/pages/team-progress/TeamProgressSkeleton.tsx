import { Skeleton } from "@/components/shared";

/** Layout-stable placeholder mirroring the status bar + panels layout. */
export default function TeamProgressSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-6">
      <Skeleton className="h-[88px] rounded-2xl" />
      <Skeleton className="h-11 rounded-2xl lg:hidden" />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Skeleton className="h-80 rounded-2xl" />
        <div className="hidden space-y-2 lg:block">
          {["c1", "c2", "c3", "c4", "c5"].map((key) => (
            <Skeleton key={key} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
