import { useUserStore } from "@/stores/useUserStore";
import { Link } from "@tanstack/react-router";
import { Settings, LogOut, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import useStaffLogin from "@/hooks/useLoginLink";

export function UserMenu() {
  const { isAuthenticated, name, email, image, scopes, logout, sessionLoading } = useUserStore((state) => state);
  const onStaffLogin = useStaffLogin();

  const isAdmin = scopes !== undefined && (scopes.includes("admin") || scopes.includes("manager-rally") || scopes.includes("rally:admin"));

  if (sessionLoading) {
    return <div className="h-9 w-20 animate-pulse rounded-md border border-border bg-muted" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onStaffLogin}
          className="rally-bg-accent h-8 gap-1.5 text-white hover:opacity-90"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Login NEI</span>
          <span className="sm:hidden">NEI</span>
        </Button>
        <Link to="/team-login">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Equipa
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

        {/* Dropdown Menu na vista Desktop (Hover) */}
        <div className="rally-elevate absolute right-0 top-full z-50 mt-2 hidden w-52 flex-col overflow-hidden rounded-lg border border-border bg-popover group-hover:flex">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-popover-foreground">{displayName}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="h-4 w-4" />
            Terminar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}
