import { useState } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAppToast } from "@/hooks/use-toast";
import { isIosBrowserTab } from "@/lib/pushSubscription";
import { PUSH_ON_FAILED } from "./pushMessages";

/** Per-device "Agora não" — the prompt is a nudge, not a nag. */
const DISMISSED_KEY = "rally-team-push-prompt-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Private mode / blocked storage: the prompt just comes back next visit.
  }
}

/**
 * Nudges a team to turn on push where they actually look — the team page —
 * since the toggle itself lives in Preferências, which teams rarely open
 * mid-rally. Hidden once subscribed, when the server has no VAPID keys, when
 * the permission is blocked, or after "Agora não". In an iPhone Safari tab it
 * explains the Home Screen install instead, the only way iOS delivers push.
 */
export function TeamNotificationPrompt() {
  const { status, loading, subscribe } = usePushNotifications();
  const toast = useAppToast();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  if (status === "unsupported") {
    if (!isIosBrowserTab()) return null;
    return (
      <aside
        aria-label="Notificações"
        className="rally-bg-accent-soft flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-foreground"
      >
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="flex-1">
          Para receberem avisos da organização, adicionem esta app ao ecrã principal (Partilhar →
          Adicionar ao ecrã principal) e abram-na a partir do ícone.
        </p>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Agora não
        </Button>
      </aside>
    );
  }

  if (status !== "unsubscribed") return null;

  const enable = () => {
    subscribe().catch(() => toast.error(PUSH_ON_FAILED));
  };

  return (
    <aside
      aria-label="Notificações"
      className="rally-bg-accent-soft flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm text-foreground"
    >
      <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-medium">
        Ativem as notificações para receberem avisos da organização e dos postos.
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Agora não
        </Button>
        <Button size="sm" onClick={enable} disabled={loading}>
          Ativar
        </Button>
      </div>
    </aside>
  );
}
