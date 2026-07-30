import { CloudOff, RefreshCw } from "lucide-react";
import { useOfflineSync } from "@/offline/useOfflineSync";
import { useEvalQueueStatus } from "@/offline/useEvalQueueStatus";

/**
 * Drives the offline-sync loop and shows a banner while evaluation submits are
 * buffered. Mount once on the staff-evaluation surface. Renders nothing when
 * the queue is empty.
 */
export default function OfflineQueueBanner() {
  const { syncNow } = useOfflineSync();
  const { pending, failed } = useEvalQueueStatus();
  const total = pending + failed;

  if (total === 0) return null;

  return (
    <output className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
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
  );
}
