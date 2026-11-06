import AppShellSkeleton from "@/components/shared/state/AppShellSkeleton";

interface PWALoadingScreenProps {
  message?: string;
}

/**
 * Full-screen boot loader shown while the PWA is starting up (auth restore,
 * initial backend health check). Renders the app-shell skeleton so startup
 * matches the layout the user is about to see.
 */
export default function PWALoadingScreen({
  message = "A carregar o Rally...",
}: Readonly<PWALoadingScreenProps>) {
  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-background"
      style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}
    >
      <AppShellSkeleton message={message} />
    </div>
  );
}
