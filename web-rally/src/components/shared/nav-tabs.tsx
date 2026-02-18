import { Link, useLocation } from "react-router-dom";
import { useThemedComponents } from "../themes";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";
import { useState, useEffect, useRef } from "react";
import { Menu, X, ShieldCheck, Users } from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";

type NavTabsProps = ComponentProps<"ul">;

const VIEW_MODE_KEY = "rally_view_mode";
type ViewMode = "team" | "staff";

export default function NavTabs({ className, ...props }: NavTabsProps) {
  const { Button, config } = useThemedComponents();
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
                variant={isActive ? config.nav.activeVariant : "neutral"}
                className="w-full sm:w-auto"
                {...(config.nav.useBloodEffect && isActive ? { blood: true } : {})}
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/20 bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all duration-200 w-full sm:w-auto"
          >
            {viewMode === "staff" ? <ShieldCheck className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            <span className="hidden sm:inline">{viewMode === "staff" ? "Staff" : "Equipa"}</span>
          </button>
        </li>
      )}
    </>
  );

  return (
    <div className="relative">
      {/* Desktop Navigation */}
      <ul {...props} className={cn("hidden sm:flex gap-3 items-center", className)}>
        <NavItems />
      </ul>

      {/* Mobile Navigation */}
      <div className="sm:hidden" ref={mobileMenuRef}>
        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-center w-full p-3 rounded-lg bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] text-white hover:bg-[rgb(255,255,255,0.2)] transition-colors"
        >
          <Menu className="w-5 h-5 mr-2" />
          <span className="font-medium">Menu</span>
        </button>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-[rgb(0,0,0,0.9)] border border-[rgb(255,255,255,0.2)] rounded-lg shadow-lg">
            <div className="p-2">
              <div className="flex items-center justify-between p-2 mb-2">
                <span className="text-white font-medium">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-white hover:text-red-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ul className="space-y-1">
                <NavItems />
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

