import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";
import { useState, useEffect, useRef } from "react";
import { Menu, X, ShieldCheck, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";

type NavTabsProps = ComponentProps<"ul">;

const VIEW_MODE_KEY = "rally_view_mode";
type ViewMode = "team" | "staff";

interface NavLink {
  readonly name: string;
  readonly href: string;
  readonly show: boolean;
}

/**
 * A hover/click dropdown grouping the management destinations so the navbar
 * stays uncluttered (mirrors the NEI gamification grouped-nav structure, in
 * rally's soft-depth language). Desktop only.
 */
function NavGroup({ label, items }: { readonly label: string; readonly items: readonly NavLink[] }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasActive = items.some((i) => i.href === location.pathname);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Button
        type="button"
        variant={hasActive ? "default" : "ghost"}
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="gap-1"
      >
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <ul className="rally-elevate min-w-[12rem] overflow-hidden rounded-xl border border-border bg-popover p-1.5">
            {items.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <Link to={item.href} onClick={() => setOpen(false)}>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                    >
                      {item.name}
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function NavTabs({ className, ...props }: NavTabsProps) {
  const location = useLocation();
  const { scopes } = useUserStore((state) => state);
  const { settings } = useRallySettings();
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const isAdminOrManager = scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally") || scopes.includes("rally:admin"));
  const isStaff = scopes !== undefined && scopes.includes("rally-staff");
  const isPrivileged = isAdminOrManager || isStaff;
  const isDualRole = isPrivileged && isTeamAuthenticated;

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

  const showTeamView = isTeamAuthenticated && (!isPrivileged || (isDualRole && viewMode === "team"));
  const showScoreMenu = settings?.show_score_mode !== "hidden";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (mobileMenuRef.current && event.target instanceof Node && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    }
    if (isMobileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  // Primary (top-level) destinations — kept short.
  const primary: NavLink[] = [
    { name: "Progresso", href: "/team-progress", show: showTeamView },
    { name: "Pontuação", href: "/scoreboard", show: showTeamView && showScoreMenu },
    { name: "Trocar Equipa", href: "/team-login", show: showTeamView },

    { name: "Pontuação", href: "/scoreboard", show: !showTeamView && showScoreMenu },
    { name: "Postos", href: "/postos", show: !showTeamView && (isPrivileged || settings?.show_checkpoint_map === true) },
    { name: "Login", href: "/team-login", show: !showTeamView && !isTeamAuthenticated && scopes === undefined },
  ].filter((item) => item.show);

  // Management destinations — collapsed into a dropdown to declutter.
  const management: NavLink[] = [
    { name: "Avaliação", href: "/staff-evaluation", show: !showTeamView && (isStaff || isAdminOrManager) },
    { name: "Membros", href: "/team-members", show: !showTeamView && (isAdminOrManager || isStaff) },
    { name: "Admin", href: "/admin", show: !showTeamView && isAdminOrManager },
    { name: "Atribuições", href: "/assignment", show: !showTeamView && isAdminOrManager },
    { name: "Versus", href: "/versus", show: !showTeamView && isAdminOrManager },
    { name: "Configurações", href: "/settings", show: !showTeamView && isAdminOrManager },
  ].filter((item) => item.show);

  const renderLink = (item: NavLink) => {
    const isActive = location.pathname === item.href;
    return (
      <li key={`${item.name}-${item.href}`}>
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
  };

  const ViewToggle = () =>
    isDualRole ? (
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
    ) : null;

  return (
    <div className="relative">
      {/* Desktop Navigation */}
      <ul {...props} className={cn("hidden items-center gap-1 sm:flex", className)}>
        {primary.map(renderLink)}
        {management.length > 0 && (
          <li>
            <NavGroup label="Gestão" items={management} />
          </li>
        )}
        <ViewToggle />
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
              {primary.map(renderLink)}
              {management.length > 0 && (
                <>
                  <li className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Gestão
                  </li>
                  {management.map(renderLink)}
                </>
              )}
              <ViewToggle />
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
