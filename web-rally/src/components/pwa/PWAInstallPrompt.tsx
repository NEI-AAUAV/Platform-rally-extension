import { useState, useEffect } from "react";
import { Share, SquarePlus, Smartphone } from "lucide-react";
import { useDisplayMode } from "@/hooks/useDisplayMode";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISSED_STORAGE_KEY = "rally_install_prompt_dismissed";

/** Safari never fires `beforeinstallprompt`, so Apple needs manual instructions. */
function isAppleBrowser(): boolean {
  if (globalThis.window === undefined) return false;
  return navigator.vendor === "Apple Computer, Inc.";
}

function readDismissed(): boolean {
  if (globalThis.window === undefined) return false;
  return globalThis.localStorage.getItem(DISMISSED_STORAGE_KEY) === "true";
}

export default function PWAInstallPrompt() {
  const displayMode = useDisplayMode();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    globalThis.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      globalThis.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    globalThis.localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
  };

  // Already installed, or the user said no: nothing to offer.
  if (displayMode === "standalone" || dismissed) return null;

  const showApple = deferredPrompt === null && isAppleBrowser();
  if (deferredPrompt === null && !showApple) return null;

  return (
    <div
      className="rally-surface rally-glass fixed left-4 right-4 z-50 p-4 shadow-lg"
      style={{ bottom: "calc(1rem + var(--safe-bottom))" }}
    >
      <div className="flex items-center gap-3">
        <div className="rally-bg-accent flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white">
          <Smartphone className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Instalar Rally Tascas</h3>
          {showApple ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              Toca em <Share className="inline h-4 w-4 shrink-0" aria-label="Partilhar" /> Partilhar
              e depois em <SquarePlus className="inline h-4 w-4 shrink-0" aria-hidden /> Adicionar
              ao Ecrã Principal
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Instala a aplicação para acesso rápido e notificações
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dispensar sugestão de instalação"
          >
            Agora não
          </button>
          {!showApple && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="rally-bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Instalar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
