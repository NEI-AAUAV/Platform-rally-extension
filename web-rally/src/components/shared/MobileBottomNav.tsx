import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Trophy, MapPin, Users, Award, QrCode, X, ShieldCheck, ClipboardCheck, Compass, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/useUserStore";
import useRallySettings from "@/hooks/useRallySettings";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import useTeamAuth from "@/hooks/useTeamAuth";
import { TeamQrCard } from "@/components/checkin/TeamQrCard";

interface NavItem {
  readonly name: string;
  readonly href: string;
  readonly Icon: ComponentType<{ className?: string }>;
  readonly show: boolean;
}

/**
 * Phone-first bottom navigation, role- and settings-aware. Hidden on >= sm.
 * Team users get their destinations (incl. Conquistas) plus a raised center QR
 * button that opens their identity QR for staff to scan at a checkpoint.
 */
export function MobileBottomNav() {
  const location = useLocation();
  const { scopes } = useUserStore((state) => state);
  const { settings } = useRallySettings();
  const { isAuthenticated: isTeamAuthenticated, team } = useTeamAuth();
  const [qrOpen, setQrOpen] = useState(false);

  const isAdminOrManager =
    scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally") || scopes.includes("rally:admin"));
  const isStaff = scopes !== undefined && scopes.includes("rally-staff");
  const isGuide = scopes !== undefined && scopes.includes("rally-guide");
  const isPrivileged = isAdminOrManager || isStaff;
  const showGuideFeature =
    (settings?.guide_mode_enabled === true && settings?.guide_mode_active === true) ||
    settings?.event_type === "peddy_paper";

  const showScore = settings?.show_score_mode !== "hidden";
  const showPostos = isPrivileged || settings?.show_checkpoint_map === true;
  const checkpointsLabel = capitalize(useEventTerms().checkpoints);

  // Any authenticated team (incl. dual-role staff/admin) gets the team
  // destinations + QR FAB; privileged-only users keep the public/staff nav.
  const showTeamNav = isTeamAuthenticated;
  const accessCode = team?.access_code;

  const items: NavItem[] = showTeamNav
    ? [
        { name: "Progresso", href: "/team-progress", Icon: Home, show: true },
        { name: "Pontos", href: "/scoreboard", Icon: Trophy, show: showScore },
        { name: checkpointsLabel, href: "/postos", Icon: MapPin, show: showPostos },
        { name: "Conquistas", href: "/conquistas", Icon: Award, show: settings?.badges_enabled !== false },
        { name: "Equipa", href: "/team-info", Icon: Users, show: true },
        { name: "Definições", href: "/team-settings", Icon: Settings, show: true },
      ].filter((i) => i.show)
    : [
        { name: "Início", href: "/", Icon: Home, show: true },
        { name: "Pontos", href: "/scoreboard", Icon: Trophy, show: showScore },
        { name: checkpointsLabel, href: "/postos", Icon: MapPin, show: showPostos },
        { name: "Admin", href: "/admin", Icon: ShieldCheck, show: isAdminOrManager },
        {
          name: "Avaliação",
          href: "/staff-evaluation",
          Icon: ClipboardCheck,
          show: isStaff || isAdminOrManager,
        },
        {
          name: "Membros",
          href: "/team-members",
          Icon: Users,
          show: isStaff && !isAdminOrManager,
        },
        { name: "Guia", href: "/guide", Icon: Compass, show: showGuideFeature && (isGuide || isStaff || isAdminOrManager) },
        {
          name: "Equipa",
          href: isTeamAuthenticated ? "/team-progress" : "/team-login",
          Icon: Users,
          show: !isPrivileged && !(isGuide && showGuideFeature),
        },
      ].filter((i) => i.show);

  const showQrFab = showTeamNav && !!accessCode;

  const renderTab = (item: NavItem) => {
    const isActive = location.pathname === item.href;
    return (
      <li key={item.name} className="min-w-0 flex-1">
        <Link
          to={item.href}
          className={cn(
            "flex flex-col items-center gap-0.5 px-0.5 py-2 text-center text-[9.5px] font-medium leading-tight transition-colors",
            isActive ? "rally-accent" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <item.Icon className="h-[18px] w-[18px] shrink-0" />
          <span className="w-full truncate">{item.name}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      {showQrFab && (
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          aria-label="Mostrar o meu QR de equipa"
          className="rally-bg-accent fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-1/2 z-50 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full text-white shadow-[0_10px_26px_-8px_var(--rally-accent,#008542)] sm:hidden"
        >
          <QrCode className="h-6 w-6" />
        </button>
      )}

      <nav
        aria-label="Navegação rápida"
        className="rally-elevate fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch">{items.map(renderTab)}</ul>
      </nav>

      {qrOpen && accessCode && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:hidden"
          onClick={() => setQrOpen(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                aria-label="Fechar"
                className="grid h-10 w-10 place-items-center rounded-full bg-card text-foreground shadow"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <TeamQrCard accessCode={accessCode} />
          </div>
        </div>
      )}
    </>
  );
}

export default MobileBottomNav;
