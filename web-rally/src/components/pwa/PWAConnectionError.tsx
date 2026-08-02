import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

interface PWAConnectionErrorProps {
  onRetry: () => void | Promise<void>;
  /** True while a retry attempt is in flight — disables the button and spins its icon. */
  retrying?: boolean;
}

/**
 * Full-screen fallback shown when the app cannot reach the NEI backend
 * (offline device, DNS failure, server down). Distinct from ErrorBoundary,
 * which handles in-app render crashes — this is specifically "no
 * connection", so the copy and action (retry the connection) differ.
 */
export default function PWAConnectionError({ onRetry, retrying = false }: PWAConnectionErrorProps) {
  const [attempted, setAttempted] = useState(false);

  const handleRetry = () => {
    setAttempted(true);
    void onRetry();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 overflow-hidden bg-background px-6"
      style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 15%, hsl(var(--destructive) / 0.16), transparent 55%)",
        }}
      />

      <div className="relative flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 animate-[rally-pulse-ring_2.2s_ease-in-out_infinite] rounded-full bg-destructive/10" />
        <span className="absolute inset-0 rounded-full border-2 border-destructive/25" />
        <WifiOff className="relative h-10 w-10 text-destructive" strokeWidth={1.75} />
      </div>

      <div className="relative flex max-w-sm flex-col items-center gap-2 text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          Sem ligação ao servidor
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Não foi possível contactar os serviços de backend do NEI. Verifica a tua ligação à
          internet e tenta novamente.
        </p>
        {attempted && !retrying && (
          <p className="mt-1 text-xs font-medium text-destructive">
            Ainda sem resposta do servidor.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="rally-btn rally-blood-button relative flex items-center gap-2 rounded-md bg-destructive px-6 py-2.5 text-sm font-semibold text-destructive-foreground transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? "A tentar..." : "Tentar novamente"}
      </button>
    </div>
  );
}
