import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";
import { useState, useEffect, useRef } from "react";
import { Menu, X, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";

type NavTabsProps = ComponentProps<"ul">;

const VIEW_MODE_KEY = "rally_view_mode";
type ViewMode = "team" | "staff";

export default function NavTabs({ className, ...props }: NavTabsProps) {
  const location = useLocation();
  const { scopes } = useUserStore((state) => state);
  const { settings } = useRallySettings();
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Check if user has admin/manager privileges
  const isAdminOrManager = scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally") || scopes.includes("rally:admin"));

  // Check if user has staff privileges
  const isStaff = scopes !== undefined && scopes.includes("rally-staff");

  const isPrivileged = isAdminOrManager || isStaff;

  // Dual-role: has both a staff/admin account AND a team token
  const isDualRole = isPrivileged && isTeamAuthenticated;

  // View mode toggle — only relevant for dual-role users
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) ?? "staff";
    }
    return "staff";
  });

  const toggleViewMode = () => {
    const next: ViewMode = viewMode === "staff" ? "team" : "staff";
    setViewMode(next);
    localStorage.setItem(VIEW_MODE_KEY, next);
    setIsMobileMenuOpen(false);
  };

  // Determine effective team user status:
  // - Pure team user (no staff scopes): always team view
  // - Dual-role: depends on viewMode toggle
  // - Staff/admin only: always staff view
  const showTeamView = isTeamAuthenticated && (!isPrivileged || (isDualRole && viewMode === "team"));

  // Check if score should be visible
  const showScoreMenu = settings?.show_score_mode !== "hidden";

  // Handle click outside to close mobile menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (mobileMenuRef.current && event.target instanceof Node && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    }

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const navigation = [
    // --- Team view nav ---
    { name: "Progresso", href: "/team-progress", show: showTeamView },
    { name: "Pontuação", href: "/scoreboard", show: showTeamView && showScoreMenu },
    { name: "Trocar Equipa", href: "/team-login", show: showTeamView },

    // --- Staff / Admin / Public nav ---
    { name: "Pontuação", href: "/scoreboard", show: !showTeamView && showScoreMenu },
    { name: "Postos", href: "/postos", show: !showTeamView && (isPrivileged || (settings?.show_checkpoint_map === true)) },
    { name: "Admin", href: "/admin", show: !showTeamView && isAdminOrManager },
    { name: "Atribuições", href: "/assignment", show: !showTeamView && isAdminOrManager },
    { name: "Versus", href: "/versus", show: !showTeamView && isAdminOrManager },
    { name: "Membros", href: "/team-members", show: !showTeamView && (isAdminOrManager || isStaff) },
    { name: "Configurações", href: "/settings", show: !showTeamView && isAdminOrManager },
    { name: "Avaliação", href: "/staff-evaluation", show: !showTeamView && (isStaff || isAdminOrManager) },
    { name: "Login", href: "/team-login", show: !showTeamView && !isTeamAuthenticated && scopes === undefined },
  ].filter((item) => item.show);

  const NavItems = () => (
    <>
      {navigation.map((item) => {
        const isActive = location.pathname === item.href;
        return (
          <li key={item.name}>
            <Link to={item.href} onClick={() => setIsMobileMenuOpen(false)}>
              <Button
                variant={isActive ? "default" : "ghost"}
                size="sm"
                className="w-full justify-start sm:w-auto sm:justify-center"
              >
                {item.name}
              </Button>
            </Link>
          </li>
        );
      })}

      {/* View mode toggle — only for dual-role users */}
      {isDualRole && (
        <li>
          <button
            onClick={toggleViewMode}
            title={viewMode === "staff" ? "Mudar para vista de equipa" : "Mudar para vista de staff"}
            className="flex w-full items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-accent sm:w-auto"
          >
            {viewMode === "staff" ? <ShieldCheck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            <span className="hidden sm:inline">{viewMode === "staff" ? "Staff" : "Equipa"}</span>
          </button>
        </li>
      )}
    </>
  );

  return (
    <div className="relative">
      {/* Desktop Navigation */}
      <ul {...props} className={cn("hidden items-center gap-1 sm:flex", className)}>
        <NavItems />
      </ul>

      {/* Mobile overflow menu — primary actions live in MobileBottomNav;
          this carries the longer staff/admin list. */}
      <div className="sm:hidden" ref={mobileMenuRef}>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Abrir menu"
          className="flex items-center justify-center rounded-md border border-border bg-card p-2 text-foreground transition-colors hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>

        {isMobileMenuOpen && (
          <div className="rally-elevate absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-popover">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-popover-foreground">Menu</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-1 p-2">
              <NavItems />
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
