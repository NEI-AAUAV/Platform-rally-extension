import { useUserStore } from "@/stores/useUserStore";
import { Link } from "react-router-dom";
import { Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const { isAuthenticated, name, email, image, scopes, logout, sessionLoading } = useUserStore((state) => state);

  const isAdmin = scopes !== undefined && (scopes.includes("admin") || scopes.includes("manager-rally") || scopes.includes("rally:admin"));

  if (sessionLoading) {
    return <div className="h-9 w-20 animate-pulse bg-muted brutal-shadow border-2 border-foreground" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/team-login">
          <Button variant="outline" size="sm" className="h-8">
            Login Equipa
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
          className="flex items-center gap-1.5 border-2 border-foreground bg-card px-2 py-1 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground sm:px-2.5 brutal-shadow-sm"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="text-xs font-bold uppercase tracking-wider">Admin</span>
        </Link>
      )}
      
      <div className="group relative flex items-center gap-2 border-2 border-foreground bg-card px-1.5 py-1 transition-colors hover:bg-muted sm:px-2 cursor-pointer brutal-shadow">
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="h-7 w-7 object-cover sm:h-8 sm:w-8 border border-foreground"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center bg-primary text-[10px] font-bold text-primary-foreground sm:h-8 sm:w-8 sm:text-xs border border-foreground">
            {initials}
          </div>
        )}
        <span className="hidden text-sm font-bold uppercase tracking-wide sm:inline">
          {displayName}
        </span>

        {/* Dropdown Menu na vista Desktop (Hover) */}
        <div className="absolute right-0 top-full mt-2 hidden w-48 flex-col border-2 border-foreground bg-card brutal-shadow group-hover:flex z-50">
          <div className="border-b-2 border-foreground px-4 py-2">
            <p className="truncate text-sm font-bold">{displayName}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="h-4 w-4" />
            Terminar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}
