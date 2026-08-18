import { Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Users,
  MapPin,
  Activity as ActivityIcon,
  Palette,
  CalendarRange,
  Settings2,
  ClipboardList,
  Swords,
  UserCog,
  ClipboardCheck,
  Compass,
  LayoutDashboard,
  Gavel,
  Trophy,
  Zap,
  History,
  Gauge,
  BellRing,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import useClickOutside from "@/hooks/useClickOutside";
import { useBackDismiss } from "@/hooks/useBackDismiss";
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
} from "./components";
import { getCheckpoints, getVapidPublicKey } from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
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

const TABS: ReadonlyArray<{ id: AdminTabId; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "teams", label: "Equipas", icon: Users },
  { id: "checkpoints", label: "Postos", icon: MapPin },
  { id: "activities", label: "Atividades", icon: ActivityIcon },
  { id: "members", label: "Membros", icon: UserCog },
  { id: "assignment", label: "Atribuições", icon: ClipboardList },
  { id: "guide-assignment", label: "Guias", icon: Compass },
  { id: "evaluation", label: "Avaliação", icon: ClipboardCheck },
  { id: "versus", label: "Versus", icon: Swords },
  { id: "judging", label: "Julgamento", icon: Gavel },
  { id: "badges", label: "Crachás", icon: Trophy },
  { id: "scoring", label: "Pontuação", icon: Zap },
  { id: "branding", label: "Identidade", icon: Palette },
  { id: "events", label: "Edições", icon: CalendarRange },
  { id: "notifications", label: "Anúncios", icon: BellRing },
  { id: "settings", label: "Configurações", icon: Settings2 },
  { id: "audit", label: "Auditoria", icon: History },
  { id: "metrics", label: "Métricas", icon: Gauge },
];

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
  const activeTab: AdminTabId = rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "dashboard";
  const navigate = adminRoute.useNavigate();
  const setActiveTab = (id: AdminTabId) => navigate({ search: { tab: id }, replace: true });
  const activeTabMeta = TABS.find((t) => t.id === activeTab) ?? TABS[0]!;

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  useClickOutside(drawerRef, isDrawerOpen, () => setIsDrawerOpen(false));
  useBackDismiss(isDrawerOpen, () => setIsDrawerOpen(false));

  const selectTab = (id: AdminTabId) => {
    setActiveTab(id);
    setIsDrawerOpen(false);
  };

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

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        {/* Mobile: current-tab bar that opens a drawer with all sections */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-haspopup="menu"
            aria-expanded={isDrawerOpen}
            className="rally-surface rally-press flex w-full items-center gap-2.5 rounded-lg p-3 text-sm font-semibold text-foreground"
          >
            <Menu className="h-4 w-4 shrink-0 text-muted-foreground" />
            <activeTabMeta.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{activeTabMeta.label}</span>
          </button>

          {isDrawerOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsDrawerOpen(false)}
              aria-hidden="true"
            />
          )}

          <dialog
            ref={drawerRef}
            open={isDrawerOpen || undefined}
            aria-modal="true"
            aria-label="Secções de administração"
            className={cn(
              "rally-elevate fixed inset-y-0 left-auto right-0 z-50 m-0 flex h-full max-h-none w-72 max-w-[85vw] flex-col border-y-0 border-l border-r-0 border-border bg-popover outline-none transition-transform duration-300 ease-out",
              isDrawerOpen ? "translate-x-0" : "pointer-events-none invisible translate-x-full",
            )}
            style={{
              paddingTop: "max(20px, var(--safe-top))",
              paddingBottom: "calc(var(--safe-bottom) + var(--rally-tabbar-height))",
              paddingRight: "var(--safe-right)",
              paddingLeft: "var(--safe-left)",
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <span className="rally-display truncate text-sm font-black uppercase tracking-tight text-popover-foreground">
                Administração
              </span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Fechar menu"
                className="-m-2 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav aria-label="Secções de administração" className="flex-1 space-y-1 overflow-y-auto p-3">
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                const disabled = disabledTabIds.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTab(id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rally-press flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "rally-bg-accent text-white"
                        : "text-foreground/80 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{label}</span>
                    {disabled && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        desativado
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </dialog>
        </div>

        {/* Desktop: vertical sticky sidebar */}
        <nav
          aria-label="Secções de administração"
          className="rally-surface hidden gap-1 p-1.5 lg:sticky lg:top-24 lg:flex lg:flex-col"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            const disabled = disabledTabIds.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={active ? "page" : undefined}
                className={[
                  "rally-press flex shrink-0 items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors lg:w-full",
                  active
                    ? "rally-bg-accent text-white"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {disabled && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                    desativado
                  </span>
                )}
              </button>
            );
          })}
        </nav>

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
              <FeatureDisabledAlert featureName="sistema de crachás / conquistas" settingsPath="/settings" />
            ))}
          {activeTab === "scoring" && <DynamicScoringTab />}
          {activeTab === "settings" && <RallySettings embedded />}
          {activeTab === "audit" && <AuditLogTab />}
          {activeTab === "metrics" && <MetricsTab />}
        </div>
      </div>
    </div>
  );
}
