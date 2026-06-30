import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";
import { useState, useEffect, useRef } from "react";
import { Menu, X, ShieldCheck, Users, ChevronDown } from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import useTeamAuth from "@/hooks/useTeamAuth";

type NavTabsProps = ComponentProps<"ul">;

const VIEW_MODE_KEY = "rally_view_mode";
type ViewMode = "team" | "staff";

interface NavLink {
  readonly name: string;
  readonly href: string;
  readonly show: boolean;
}

const linkClass = (isActive: boolean) =>
  cn(
    "block px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-colors",
    isActive ? "rally-accent" : "text-muted-foreground hover:text-foreground",
  );

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-colors",
          hasActive ? "rally-accent" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <ul className="rally-elevate min-w-[10rem] overflow-hidden rounded-xl border border-border bg-popover p-1.5 space-y-0.5">
            {items.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    onClick={() => setOpen(false)}
                    className={linkClass(isActive)}
                  >
                    {item.name}
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
  const isGuide = scopes !== undefined && scopes.includes("rally-guide");
  const isPrivileged = isAdminOrManager || isStaff || isGuide;
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
  const terms = useEventTerms();
  const checkpointsLabel = capitalize(terms.checkpoints);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (mobileMenuRef.current && event.target instanceof Node && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    }
    if (isMobileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  const primary: NavLink[] = [
    { name: "Progresso", href: "/team-progress", show: showTeamView },
    { name: "Pontuação", href: "/scoreboard", show: showTeamView && showScoreMenu },
    { name: "Conquistas", href: "/conquistas", show: showTeamView },
    { name: "Trocar Equipa", href: "/team-login", show: showTeamView },

    { name: "Pontuação", href: "/scoreboard", show: !showTeamView && showScoreMenu },
    { name: checkpointsLabel, href: "/postos", show: !showTeamView && (isPrivileged || settings?.show_checkpoint_map === true) },
    { name: "Login", href: "/team-login", show: !showTeamView && !isTeamAuthenticated && scopes === undefined },
  ].filter((item) => item.show);

  // Admin sees /admin (everything consolidated); staff sees evaluation + members; guides see guide page
  const management: NavLink[] = [
    { name: "Admin", href: "/admin", show: !showTeamView && isAdminOrManager },
    { name: "Avaliação", href: "/staff-evaluation", show: !showTeamView && (isStaff || isAdminOrManager) },
    { name: "Membros", href: "/team-members", show: !showTeamView && isStaff && !isAdminOrManager },
    { name: "Guia", href: "/guide", show: !showTeamView && (isGuide || isStaff || isAdminOrManager) },
    { name: "Cronómetro", href: "/stopwatch", show: !showTeamView && (isStaff || isAdminOrManager) },
  ].filter((item) => item.show);

  const renderLink = (item: NavLink) => {
    const isActive = location.pathname === item.href;
    return (
      <li key={`${item.name}-${item.href}`}>
        <Link
          to={item.href}
          onClick={() => setIsMobileMenuOpen(false)}
          className={linkClass(isActive)}
        >
          {item.name}
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
          className="flex w-full items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-secondary-foreground transition-colors hover:bg-accent sm:w-auto"
        >
          {viewMode === "staff" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{viewMode === "staff" ? "Staff" : "Equipa"}</span>
        </button>
      </li>
    ) : null;

  return (
    <div className="relative">
      {/* Desktop */}
      <ul {...props} className={cn("hidden items-center gap-1 sm:flex", className)}>
        {primary.map(renderLink)}
        {management.length > 0 && (
          <li>
            <NavGroup label="Gestão" items={management} />
          </li>
        )}
        <ViewToggle />
      </ul>

      {/* Mobile overflow */}
      <div className="sm:hidden" ref={mobileMenuRef}>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Abrir menu"
          className="flex items-center justify-center rounded-md border border-border bg-card p-2 text-foreground transition-colors hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>

        {isMobileMenuOpen && (
          <div className="rally-elevate absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-popover">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-wider text-popover-foreground">Menu</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-0.5 p-2">
              {primary.map(renderLink)}
              {management.length > 0 && (
                <>
                  <li className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
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
