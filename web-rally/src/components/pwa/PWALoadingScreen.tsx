import neiLogoWhite from "@/assets/nei/logo/horizontal/white.png";

interface PWALoadingScreenProps {
  message?: string;
}

/**
 * Full-screen boot loader shown while the PWA is starting up (auth restore,
 * initial backend health check). Kept dependency-free (no lucide icon spin —
 * pure CSS) so it can render before the rest of the app's chunks arrive.
 */
export default function PWALoadingScreen({
  message = "A carregar o Rally...",
}: PWALoadingScreenProps) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 20%, hsl(var(--destructive) / 0.18), transparent 60%)",
        }}
      />

      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-destructive/20" />
        <span className="absolute inset-0 animate-[rally-spin_1.6s_linear_infinite] rounded-full border-2 border-transparent border-r-destructive/60 border-t-destructive" />
        <span className="absolute inset-3 animate-[rally-pulse-ring_2s_ease-in-out_infinite] rounded-full bg-destructive/10" />
        <img
          src={neiLogoWhite}
          alt="NEI"
          className="relative h-12 w-12 animate-[rally-logo-breathe_2.4s_ease-in-out_infinite] object-contain"
        />
      </div>

      <div className="relative flex flex-col items-center gap-2 text-center">
        <p className="font-display text-lg font-semibold tracking-tight text-foreground">
          {message}
        </p>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-[rally-dot-bounce_1.2s_ease-in-out_infinite] rounded-full bg-destructive [animation-delay:-0.24s]" />
          <span className="h-1.5 w-1.5 animate-[rally-dot-bounce_1.2s_ease-in-out_infinite] rounded-full bg-destructive [animation-delay:-0.12s]" />
          <span className="h-1.5 w-1.5 animate-[rally-dot-bounce_1.2s_ease-in-out_infinite] rounded-full bg-destructive" />
        </span>
      </div>
    </div>
  );
}
