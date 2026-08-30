import { CloudOff, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useOfflineSync } from "@/offline/useOfflineSync";
import { useEvalQueueStatus } from "@/offline/useEvalQueueStatus";
import { discard, retryFailed } from "@/offline/evalQueue";

/**
 * Drives the offline-sync loop and shows a banner while evaluation submits are
 * buffered. Mount once on the staff-evaluation surface. Renders nothing when
 * the queue is empty.
 *
 * C4: a permanently-failed entry (the server rejected the request — staff
 * scoring disabled, a validation error, an unknown penalty key) is no longer
 * silently retried forever. It's listed with its reason and an action to
 * retry (after fixing the underlying cause) or discard it.
 */
export default function OfflineQueueBanner() {
  const { syncNow } = useOfflineSync();
  const { items, pending, failed, refresh } = useEvalQueueStatus();
  const total = pending + failed;
  const failedItems = items.filter((i) => i.status === "failed");

  if (total === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      <output className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
        <span className="inline-flex items-center gap-2 font-medium">
          <CloudOff className="h-4 w-4" />
          {pending > 0 && <span>{pending} avaliação(ões) por sincronizar</span>}
          {failed > 0 && <span>· {failed} com falha</span>}
        </span>
        <button
          type="button"
          onClick={() => void syncNow()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-amber-500/30"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Sincronizar
        </button>
      </output>

      {failedItems.map((item) => (
        <div
          key={item.idempotencyKey}
          className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          <span className="min-w-0 truncate">
            Equipa {item.teamId}, atividade {item.activityId}: {item.lastError ?? "falha"}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                void retryFailed(item.idempotencyKey).then(() => syncNow());
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 font-semibold transition-colors hover:bg-red-500/30"
            >
              <RotateCcw className="h-3 w-3" /> Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => {
                void discard(item.idempotencyKey).then(() => refresh());
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 font-semibold transition-colors hover:bg-red-500/30"
            >
              <Trash2 className="h-3 w-3" /> Descartar
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
