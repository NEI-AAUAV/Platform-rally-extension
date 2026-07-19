import { Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  type LucideIcon,
} from "lucide-react";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { PageHeader, LoadingState } from "@/components/shared";
import {
  TeamManagement,
  CheckpointManagement,
  ActivityManagement,
  BrandingSettings,
  EventsManagement,
  DeferredJudgingTab,
  BadgeAdminTab,
  DynamicScoringTab,
} from "./components";
import { getCheckpoints } from "@/client";
import RallySettings from "@/pages/settings";
import Assignment from "@/pages/assignment";
import GuideAssignment from "@/pages/guide-assignment";
import Versus from "@/pages/versus";
import TeamMembers from "@/pages/team-members";
import ManagerEvaluationPage from "@/pages/staff-evaluation/manager-only";
import LiveDashboard from "./components/LiveDashboard";
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
  { id: "settings", label: "Configurações", icon: Settings2 },
];

export default function Admin() {
  const { isLoading, isRallyAdmin, userStore } = useUser();
  const fallbackPath = useFallbackNavigation();
  const { tab: rawTab } = adminRoute.useSearch();
  const activeTab: AdminTabId =
    rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "dashboard";
  const navigate = adminRoute.useNavigate();
  const setActiveTab = (id: AdminTabId) => navigate({ search: { tab: id }, replace: true });

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
        {/* Sidebar nav (desktop) / pill strip (mobile) */}
        <nav
          aria-label="Secções de administração"
          className="rally-surface flex gap-1 overflow-x-auto p-1.5 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={active ? "page" : undefined}
                className={[
                  "rally-press flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors sm:gap-2.5 sm:px-3.5 sm:text-sm lg:w-full",
                  active
                    ? "rally-bg-accent text-white"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
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
          {activeTab === "members" && <TeamMembers embedded />}
          {activeTab === "assignment" && <Assignment embedded />}
          {activeTab === "guide-assignment" && <GuideAssignment embedded />}
          {activeTab === "versus" && <Versus embedded />}
          {activeTab === "evaluation" && <ManagerEvaluationPage embedded />}
          {activeTab === "judging" && <DeferredJudgingTab />}
          {activeTab === "badges" && <BadgeAdminTab />}
          {activeTab === "scoring" && <DynamicScoringTab />}
          {activeTab === "settings" && <RallySettings embedded />}
        </div>
      </div>
    </div>
  );
}
