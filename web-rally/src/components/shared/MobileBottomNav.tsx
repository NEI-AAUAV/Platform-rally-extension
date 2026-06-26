import { Link, useLocation } from "@tanstack/react-router";
import { Home, Trophy, MapPin, Users } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/useUserStore";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";

interface NavItem {
  readonly name: string;
  readonly href: string;
  readonly Icon: ComponentType<{ className?: string }>;
  readonly show: boolean;
}

/**
 * Phone-first bottom navigation for use at checkpoints: the four primary
 * destinations, role- and settings-aware. Hidden on >= sm (the navbar carries
 * full navigation there). The longer staff/admin list lives in NavTabs' menu.
 */
export function MobileBottomNav() {
  const location = useLocation();
  const { scopes } = useUserStore((state) => state);
  const { settings } = useRallySettings();
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();

  const isPrivileged = scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally") ||
      scopes.includes("rally:admin") || scopes.includes("rally-staff"));

  const showScore = settings?.show_score_mode !== "hidden";
  const showPostos = isPrivileged || settings?.show_checkpoint_map === true;

  const items: NavItem[] = [
    { name: "Início", href: "/", Icon: Home, show: true },
    { name: "Pontos", href: "/scoreboard", Icon: Trophy, show: showScore },
    { name: "Postos", href: "/postos", Icon: MapPin, show: showPostos },
    {
      name: "Equipa",
      href: isTeamAuthenticated ? "/team-progress" : "/team-login",
      Icon: Users,
      show: true,
    },
  ].filter((item) => item.show);

  return (
    <nav
      aria-label="Navegação rápida"
      className="rally-elevate fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {items.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <li key={item.name} className="flex-1">
              <Link
                to={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  isActive
                    ? "rally-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.Icon className="h-5 w-5" />
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileBottomNav;
