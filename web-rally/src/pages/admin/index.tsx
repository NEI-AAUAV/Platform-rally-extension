import { Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Settings2 } from "lucide-react";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { PageHeader, LoadingState, FeatureDisabledAlert } from "@/components/shared";
import {
  TeamManagement,
  CheckpointManagement,
  ActivityManagement,
  BrandingSettings,
  EventsManagement,
  DeferredJudgingTab,
  BadgeAdminTab,
  DynamicScoringTab,
  AuditLogTab,
  MetricsTab,
  BroadcastTab,
  AdminSearch,
} from "./components";
import AdminSidebar from "./components/AdminSidebar";
import AdminMobileDrawer from "./components/AdminMobileDrawer";
import { ADMIN_NAVIGATION, ADMIN_ITEMS, ADMIN_ITEM_BY_ID } from "./adminNavigation";
import { getCheckpoints, getVapidPublicKey } from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
import { type AdminSearchEntry } from "@/lib/adminSearchIndex";
import { useScrollToSearchTarget } from "@/hooks/useScrollToSearchTarget";
import RallySettings from "@/pages/settings";
import Assignment from "@/pages/assignment";
import GuideAssignment from "@/pages/guide-assignment";
import Versus from "@/pages/versus";
import TeamMembers from "@/pages/team-members";
import ManagerEvaluationPage from "@/pages/staff-evaluation/manager-only";
import LiveDashboard from "./components/dashboard/LiveDashboard";
import { adminRoute, type AdminTabId } from "@/router/routes";

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  order: number;
}

export default function Admin() {
  const { isLoading, isRallyAdmin, userStore } = useUser();
  const fallbackPath = useFallbackNavigation();
  const { settings } = useRallySettings();

  // Web push needs a VAPID key pair configured on this deploy — with none
  // set, /push/* 503s on every call. Same "hidden, not broken" contract as
  // badges_enabled below: no admin surfaces a tab that can only fail.
  const { data: vapidKey } = useQuery({
    queryKey: ["vapidPublicKey"],
    queryFn: async () => (await getVapidPublicKey()).data,
    staleTime: 5 * 60 * 1000,
  });
  const notificationsEnabled = Boolean(vapidKey?.public_key);
  const badgesEnabled = settings?.badges_enabled ?? true;
  const guideModeEnabled = settings?.guide_mode_enabled ?? false;

  // Tabs stay visible always — hiding them hid the reason along with the
  // feature. The nav shows a "desativado" hint; the content area explains
  // why and, where there's an admin switch for it, links to it.
  const disabledTabIds = new Set<AdminTabId>([
    ...(badgesEnabled ? [] : (["badges"] as const)),
    ...(notificationsEnabled ? [] : (["notifications"] as const)),
    ...(guideModeEnabled ? [] : (["guide-assignment"] as const)),
  ]);

  const { tab: rawTab } = adminRoute.useSearch();
  const activeTab: AdminTabId = rawTab && ADMIN_ITEMS.some((t) => t.id === rawTab) ? rawTab : "dashboard";
  const navigate = adminRoute.useNavigate();
  const setActiveTab = (id: AdminTabId) => navigate({ search: { tab: id }, replace: true });
  const activeTabMeta = ADMIN_ITEM_BY_ID.get(activeTab) ?? ADMIN_ITEMS[0]!;

  // A search result switches tab and, where the field has a DOM anchor, asks
  // the scroll hook to find and highlight it once the new tab has rendered.
  // The "settings" tab nests its own section switcher, so that case is handed
  // off to RallySettings instead of resolved here.
  const [pendingSearchKey, setPendingSearchKey] = useState<string | null>(null);
  const handleSearchSelect = (entry: AdminSearchEntry) => {
    setActiveTab(entry.tabId);
    setPendingSearchKey(entry.tabOnly ? null : entry.key);
  };
  useScrollToSearchTarget(activeTab === "settings" ? null : pendingSearchKey, () =>
    setPendingSearchKey(null),
  );

  const { data: checkpoints } = useQuery<Checkpoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async (): Promise<Checkpoint[]> => {
      const { data: checkpoints } = await getCheckpoints();
      return Array.isArray(checkpoints) ? checkpoints : [];
    },
    enabled: isRallyAdmin,
  });

  if (isLoading) {
    return <LoadingState message="A carregar..." />;
  }

  if (!isRallyAdmin) {
    return <Navigate to={fallbackPath} />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Gestão"
        icon={Settings2}
        title="Administração"
        description="Gerir equipas, postos, atividades, identidade visual e edições do rally."
      />

      <AdminSearch onSelect={handleSearchSelect} />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <AdminMobileDrawer
          groups={ADMIN_NAVIGATION}
          activeTab={activeTab}
          activeTabLabel={activeTabMeta.label}
          activeTabIcon={activeTabMeta.icon}
          disabledTabIds={disabledTabIds}
          onSelect={setActiveTab}
        />

        <AdminSidebar
          groups={ADMIN_NAVIGATION}
          activeTab={activeTab}
          disabledTabIds={disabledTabIds}
          onSelect={setActiveTab}
        />

        {/* Tab content */}
        <div className="min-w-0">
          {activeTab === "dashboard" && <LiveDashboard />}
          {activeTab === "teams" && <TeamManagement />}
          {activeTab === "checkpoints" && <CheckpointManagement userStore={userStore} />}
          {activeTab === "activities" && <ActivityManagement checkpoints={checkpoints || []} />}
          {activeTab === "branding" && <BrandingSettings />}
          {activeTab === "events" && <EventsManagement />}
          {activeTab === "notifications" &&
            (notificationsEnabled ? (
              <BroadcastTab />
            ) : (
              <FeatureDisabledAlert
                featureName="envio de notificações push"
                settingsPath="/settings"
                reason="Sem chave VAPID configurada neste deploy — não é um interruptor de admin, exige variáveis de ambiente no servidor."
              />
            ))}
          {activeTab === "members" && <TeamMembers embedded />}
          {activeTab === "assignment" && <Assignment embedded />}
          {activeTab === "guide-assignment" && <GuideAssignment embedded />}
          {activeTab === "versus" && <Versus embedded />}
          {activeTab === "evaluation" && <ManagerEvaluationPage embedded />}
          {activeTab === "judging" && <DeferredJudgingTab />}
          {activeTab === "badges" &&
            (badgesEnabled ? (
              <BadgeAdminTab />
            ) : (
              <FeatureDisabledAlert
                featureName="sistema de crachás / conquistas"
                settingsPath="/settings"
              />
            ))}
          {activeTab === "scoring" && <DynamicScoringTab />}
          {activeTab === "settings" && (
            <RallySettings
              embedded
              searchTargetKey={pendingSearchKey}
              onSearchTargetHandled={() => setPendingSearchKey(null)}
            />
          )}
          {activeTab === "audit" && <AuditLogTab />}
          {activeTab === "metrics" && <MetricsTab />}
        </div>
      </div>
    </div>
  );
}
