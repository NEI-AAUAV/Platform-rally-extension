import { PageHeader } from "@/components/shared";
import { AppearanceSettings } from "@/components/theme";
import { NotificationSettings } from "@/components/preferences/NotificationSettings";
import { useUserStore } from "@/stores/useUserStore";
import { useTeamAuthStore } from "@/stores/useTeamAuthStore";

/**
 * Per-device user preferences. Deliberately separate from `/settings`, which is
 * the admin-only rally configuration, and from `/profile`, which is identity
 * and participation history. Appearance needs no account, so the page stays
 * reachable while logged out; notifications need a session to own the device
 * subscription — a staff/user login or a team login — so they only show then.
 */
export default function PreferencesPage() {
  const isUser = useUserStore((s) => s.isAuthenticated);
  const isTeam = useTeamAuthStore((s) => s.isAuthenticated);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Preferências"
        description="Definições guardadas apenas neste dispositivo."
      />

      <AppearanceSettings />
      {(isUser || isTeam) && <NotificationSettings />}
    </div>
  );
}
