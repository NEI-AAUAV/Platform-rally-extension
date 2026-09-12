import Spinner from "@/components/shared/state/Spinner";

interface PWALoadingScreenProps {
  message?: string;
}

/**
 * Full-screen boot loader shown while the PWA is starting up (auth restore,
 * initial backend health check). It deliberately reuses the app-wide spinner,
 * so startup does not introduce a branded fourth loading treatment.
 */
export default function PWALoadingScreen({
  message = "A carregar o Rally...",
}: Readonly<PWALoadingScreenProps>) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 overflow-hidden bg-background"
      style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 20%, hsl(var(--destructive) / 0.18), transparent 60%)",
        }}
      />

      <Spinner size="lg" className="relative h-14 w-14" label="" />

      <div className="relative flex flex-col items-center gap-2 text-center">
        <p className="font-display text-lg font-semibold tracking-tight text-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}
