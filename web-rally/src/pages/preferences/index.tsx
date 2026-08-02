import { PageHeader } from "@/components/shared";
import { AppearanceSettings } from "@/components/theme";
import { NotificationSettings } from "@/components/preferences/NotificationSettings";
import { useUserStore } from "@/stores/useUserStore";

/**
 * Per-device user preferences. Deliberately separate from `/settings`, which is
 * the admin-only rally configuration, and from `/profile`, which is identity
 * and participation history. Appearance needs no account, so the page stays
 * reachable while logged out; notifications are subscription-per-account and
 * only shown once authenticated.
 */
export default function PreferencesPage() {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Preferências"
        description="Definições guardadas apenas neste dispositivo."
      />

      <AppearanceSettings />
      {isAuthenticated && <NotificationSettings />}
    </div>
  );
}
