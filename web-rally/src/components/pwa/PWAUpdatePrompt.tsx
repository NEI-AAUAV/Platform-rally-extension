import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";
import { logger } from "@/lib/logger";

/**
 * Offers a new app version instead of installing it under the user.
 *
 * The service worker used to register with `autoUpdate`, which activates and
 * reloads the moment a deploy lands. On an event night that can wipe a judge's
 * half-filled evaluation form mid-tap. Now the new worker waits and this bar
 * appears; reloading is a deliberate action.
 *
 * Dismissing only hides the bar — the update still installs on the next cold
 * start, so nobody is stuck on a stale build.
 */
export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      logger.error("Service worker registration failed", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="rally-surface rally-glass fixed left-4 right-4 z-[70] flex items-center gap-3 p-4 shadow-lg"
      style={{ bottom: "calc(1rem + var(--safe-bottom))" }}
    >
      <div className="rally-bg-accent grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white">
        <RefreshCw className="h-5 w-5" />
      </div>

      <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
        Nova versão disponível
        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
          Atualiza quando estiveres pronto
        </span>
      </p>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Depois
        </button>
        <button
          type="button"
          // `true` tells the waiting worker to skipWaiting and reloads once it
          // takes control — src/sw.ts handles the SKIP_WAITING message.
          onClick={() => void updateServiceWorker(true)}
          className="rally-bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
