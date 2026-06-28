import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Trophy, MapPin, Users, Award, QrCode, X } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/useUserStore";
import useRallySettings from "@/hooks/useRallySettings";
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

  const isPrivileged =
    scopes !== undefined &&
    (scopes.includes("admin") ||
      scopes.includes("manager-rally") ||
      scopes.includes("rally:admin") ||
      scopes.includes("rally-staff"));

  const showScore = settings?.show_score_mode !== "hidden";
  const showPostos = isPrivileged || settings?.show_checkpoint_map === true;

  // Any authenticated team (incl. dual-role staff/admin) gets the team
  // destinations + QR FAB; privileged-only users keep the public/staff nav.
  const showTeamNav = isTeamAuthenticated;
  const accessCode = team?.access_code;

  const items: NavItem[] = showTeamNav
    ? [
        { name: "Progresso", href: "/team-progress", Icon: Home, show: true },
        { name: "Pontos", href: "/scoreboard", Icon: Trophy, show: showScore },
        { name: "Conquistas", href: "/conquistas", Icon: Award, show: true },
        { name: "Equipa", href: "/team-login", Icon: Users, show: true },
      ].filter((i) => i.show)
    : [
        { name: "Início", href: "/", Icon: Home, show: true },
        { name: "Pontos", href: "/scoreboard", Icon: Trophy, show: showScore },
        { name: "Postos", href: "/postos", Icon: MapPin, show: showPostos },
        {
          name: "Equipa",
          href: isTeamAuthenticated ? "/team-progress" : "/team-login",
          Icon: Users,
          show: true,
        },
      ].filter((i) => i.show);

  const showQrFab = showTeamNav && !!accessCode;
  // With the FAB, split the tabs into two halves around the center notch.
  const mid = Math.ceil(items.length / 2);
  const left = showQrFab ? items.slice(0, mid) : items;
  const right = showQrFab ? items.slice(mid) : [];

  const renderTab = (item: NavItem) => {
    const isActive = location.pathname === item.href;
    return (
      <li key={item.name} className="flex-1">
        <Link
          to={item.href}
          className={cn(
            "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
            isActive ? "rally-accent" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <item.Icon className="h-5 w-5" />
          {item.name}
        </Link>
      </li>
    );
  };

  return (
    <>
      <nav
        aria-label="Navegação rápida"
        className="rally-elevate fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="relative mx-auto flex max-w-md items-stretch">
          {left.map(renderTab)}

          {showQrFab && (
            <li className="flex w-16 shrink-0 items-start justify-center">
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                aria-label="Mostrar o meu QR de equipa"
                className="rally-bg-accent -mt-6 grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_10px_26px_-8px_var(--rally-accent,#008542)] ring-4 ring-background"
              >
                <QrCode className="h-6 w-6" />
              </button>
            </li>
          )}

          {right.map(renderTab)}
        </ul>
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
