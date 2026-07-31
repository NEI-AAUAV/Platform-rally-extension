import { PageHeader } from "@/components/shared";
import { AppearanceSettings } from "@/components/theme";

/**
 * Per-device user preferences. Deliberately separate from `/settings`, which is
 * the admin-only rally configuration, and from `/profile`, which is identity
 * and participation history. Nothing here needs an account, so the page stays
 * reachable while logged out.
 */
export default function PreferencesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Preferências"
        description="Definições guardadas apenas neste dispositivo."
      />

      <AppearanceSettings />
    </div>
  );
}
