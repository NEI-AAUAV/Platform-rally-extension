import { useUserStore } from "@/stores/useUserStore";
import useTeamAuth from "@/hooks/useTeamAuth";
import { Link } from "@tanstack/react-router";
import {
  Settings,
  SlidersHorizontal,
  LogOut,
  UserPlus,
  LogIn,
  Users,
  User,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import useStaffLogin from "@/hooks/useLoginLink";
import { useLogout } from "@/auth/useLogout";

export function UserMenu() {
  const { isAuthenticated, name, email, image, scopes, sessionLoading } = useUserStore(
    (state) => state,
  );
  const { isAuthenticated: isTeamAuthenticated, teamData, logout: teamLogout } = useTeamAuth();
  const onStaffLogin = useStaffLogin();
  // M10: full OIDC sign-out (clears the local token store AND ends the
  // Authentik session), not just the local rally session.
  const logout = useLogout();

  const isAdmin =
    scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally"));

  if (sessionLoading) {
    return <div className="h-9 w-20 animate-pulse rounded-md border border-border bg-muted" />;
  }

  // Team-only identity (no OIDC session): show the team's name and its own
  // menu instead of the anonymous login buttons — a code-only session is a
  // real identity, not a visitor.
  if (!isAuthenticated && isTeamAuthenticated && teamData) {
    return (
      <div className="group relative hidden cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 py-1 transition-colors hover:bg-accent sm:flex">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          <Users className="h-4 w-4" />
        </div>
        <span className="max-w-[14ch] truncate text-sm font-semibold">{teamData.team_name}</span>

        <div className="absolute right-0 top-full z-50 hidden w-52 pt-2 group-hover:block">
          <div className="rally-elevate flex flex-col overflow-hidden rounded-lg border border-border bg-popover">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-popover-foreground">
                {teamData.team_name}
              </p>
              <p className="text-xs text-muted-foreground">Sessão de equipa</p>
            </div>
            <Link
              to="/team-settings"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-accent"
            >
              <Settings className="h-4 w-4" />
              Definições da equipa
            </Link>
            <Link
              to="/team-login"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" />
              Trocar equipa
            </Link>
            <button
              type="button"
              onClick={teamLogout}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <LogOut className="h-4 w-4" />
              Terminar sessão de equipa
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      // Login buttons render inline on desktop; on mobile they live in the
      // hamburger sidebar (see nav-tabs.tsx), so hide this block there.
      <div className="hidden items-center gap-2 sm:flex">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onStaffLogin({ mode: "registration" })}
          className="h-8 gap-1.5"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Registar</span>
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onStaffLogin({ mode: "login" })}
          className="rally-bg-accent h-8 gap-1.5 text-white hover:opacity-90"
        >
          <LogIn className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Iniciar sessão</span>
          <span className="sm:hidden">Entrar</span>
        </Button>
        <Link to="/team-login">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Código de Equipa</span>
            <span className="sm:hidden">Equipa</span>
          </Button>
        </Link>
      </div>
    );
  }

  const displayName = name || email || "Utilizador";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {isAdmin && (
        <Link
          to="/admin"
          className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-foreground transition-colors hover:bg-accent sm:flex"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Admin</span>
        </Link>
      )}

      <div className="group relative flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-1.5 py-1 transition-colors hover:bg-accent sm:px-2">
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="h-7 w-7 rounded-full object-cover sm:h-8 sm:w-8"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground sm:h-8 sm:w-8 sm:text-xs">
            {initials}
          </div>
        )}
        <span className="hidden max-w-[14ch] truncate text-sm font-semibold sm:inline">
          {displayName}
        </span>

        {/* Dropdown Menu na vista Desktop (Hover). The outer wrapper's pt-2 is a
            transparent hover bridge: it keeps the 8px visual gap but makes that
            gap part of the group, so moving the pointer into the menu never
            leaves :hover (which would close it before it could be reached). */}
        <div className="absolute right-0 top-full z-50 hidden w-52 pt-2 group-hover:block">
          <div className="rally-elevate flex flex-col overflow-hidden rounded-lg border border-border bg-popover">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-popover-foreground">
                {displayName}
              </p>
              {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
            </div>
            <Link
              to="/profile"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-accent"
            >
              <User className="h-4 w-4" />O meu perfil
            </Link>
            <Link
              to="/preferences"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-accent"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Preferências
            </Link>
            <button
              type={"button"}
              onClick={logout}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <LogOut className="h-4 w-4" />
              Terminar Sessão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
