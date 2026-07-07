import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";
import { useState, useEffect, useRef } from "react";
import { Menu, X, ShieldCheck, Users, ChevronDown, UserPlus, LogIn } from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import useGuideAccess from "@/hooks/useGuideAccess";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import useTeamAuth from "@/hooks/useTeamAuth";
import useStaffLogin from "@/hooks/useLoginLink";

type NavTabsProps = ComponentProps<"ul">;

const VIEW_MODE_KEY = "rally_view_mode";
type ViewMode = "team" | "staff";

interface NavLink {
  readonly name: string;
  readonly href: string;
  readonly show: boolean;
}

const linkClass = (isActive: boolean, isSidebar = false) =>
  cn(
    "block rounded-md text-xs font-bold uppercase tracking-wider transition-colors",
    isSidebar ? "px-3 py-2.5" : "px-2.5 py-1",
    isActive
      ? cn("rally-accent", isSidebar && "bg-accent")
      : "text-muted-foreground hover:text-foreground hover:bg-accent",
  );

function NavGroup({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly NavLink[];
}) {
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
          "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors",
          hasActive ? "rally-accent" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <ul className="rally-elevate min-w-[10rem] space-y-0.5 overflow-hidden rounded-xl border border-border bg-popover p-1.5">
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

interface RoleFlags {
  readonly isAdminOrManager: boolean;
  readonly isStaff: boolean;
  readonly isGuide: boolean;
  readonly isPrivileged: boolean;
}

function deriveRoleFlags(scopes: readonly string[] | undefined): RoleFlags {
  const isAdminOrManager = !!(
    scopes?.includes("admin") ||
    scopes?.includes("manager-rally") ||
    scopes?.includes("rally:admin")
  );
  const isStaff = !!scopes?.includes("rally-staff");
  const isGuide = !!scopes?.includes("rally-guide");
  return {
    isAdminOrManager,
    isStaff,
    isGuide,
    isPrivileged: isAdminOrManager || isStaff || isGuide,
  };
}

function ViewToggle({
  isDualRole,
  viewMode,
  toggleViewMode,
}: {
  readonly isDualRole: boolean;
  readonly viewMode: ViewMode;
  readonly toggleViewMode: () => void;
}) {
  if (!isDualRole) return null;
  return (
    <li>
      <button
        onClick={toggleViewMode}
        title={viewMode === "staff" ? "Mudar para vista de equipa" : "Mudar para vista de staff"}
        className="flex w-full items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-secondary-foreground transition-colors hover:bg-accent sm:w-auto"
      >
        {viewMode === "staff" ? (
          <ShieldCheck className="h-3.5 w-3.5" />
        ) : (
          <Users className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{viewMode === "staff" ? "Staff" : "Equipa"}</span>
      </button>
    </li>
  );
}

export default function NavTabs({ className, ...props }: NavTabsProps) {
  const location = useLocation();
  const { scopes } = useUserStore((state) => state);
  const { settings } = useRallySettings();
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();
  const onStaffLogin = useStaffLogin();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDialogElement>(null);

  const { isAdminOrManager, isStaff, isGuide, isPrivileged } = deriveRoleFlags(scopes);
  const { showGuideFeature } = useGuideAccess();
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

  const showTeamView =
    isTeamAuthenticated && (!isPrivileged || (isDualRole && viewMode === "team"));
  const showScoreMenu = settings?.show_score_mode !== "hidden";
  const terms = useEventTerms();
  const checkpointsLabel = capitalize(terms.checkpoints);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        mobileMenuRef.current &&
        event.target instanceof Node &&
        !mobileMenuRef.current.contains(event.target)
      ) {
        setIsMobileMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    }
    if (isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileMenuOpen]);

  const primary: NavLink[] = [
    { name: "Progresso", href: "/team-progress", show: showTeamView },
    { name: "Pontuação", href: "/scoreboard", show: showTeamView && showScoreMenu },
    {
      name: "Conquistas",
      href: "/conquistas",
      show: showTeamView && settings?.badges_enabled !== false,
    },
    { name: "Trocar Equipa", href: "/team-login", show: showTeamView },

    { name: "Pontuação", href: "/scoreboard", show: !showTeamView && showScoreMenu },
    {
      name: checkpointsLabel,
      href: "/postos",
      show: !showTeamView && (isPrivileged || settings?.show_checkpoint_map === true),
    },
  ].filter((item) => item.show);

  const isLoggedOut = !isTeamAuthenticated && scopes === undefined;

  // Admin sees /admin (everything consolidated); staff sees evaluation + members; guides see guide page
  const management: NavLink[] = [
    { name: "Admin", href: "/admin", show: !showTeamView && isAdminOrManager },
    {
      name: "Avaliação",
      href: "/staff-evaluation",
      show: !showTeamView && (isStaff || isAdminOrManager),
    },
    { name: "Membros", href: "/team-members", show: !showTeamView && isStaff && !isAdminOrManager },
    {
      name: "Guia",
      href: "/guide",
      show: !showTeamView && showGuideFeature && (isGuide || isStaff || isAdminOrManager),
    },
  ].filter((item) => item.show);

  const renderLink = (item: NavLink, isSidebar = false) => {
    const isActive = location.pathname === item.href;
    return (
      <li key={`${item.name}-${item.href}`}>
        <Link
          to={item.href}
          onClick={() => setIsMobileMenuOpen(false)}
          className={linkClass(isActive, isSidebar)}
        >
          {item.name}
        </Link>
      </li>
    );
  };

  return (
    <div className="relative">
      {/* Desktop */}
      <ul {...props} className={cn("hidden items-center gap-1 sm:flex", className)}>
        {primary.map((item) => renderLink(item))}
        {management.length > 0 && (
          <li>
            <NavGroup label="Gestão" items={management} />
          </li>
        )}
        <ViewToggle isDualRole={isDualRole} viewMode={viewMode} toggleViewMode={toggleViewMode} />
      </ul>

      {/* Mobile overflow */}
      <div className="sm:hidden">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Abrir menu"
          aria-expanded={isMobileMenuOpen}
          className="flex items-center justify-center rounded-md border border-border bg-card p-2 text-foreground transition-colors hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>

        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <dialog
          ref={mobileMenuRef}
          open
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            "rally-elevate fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col border-l border-border bg-popover transition-transform duration-300 ease-out m-0 max-h-none h-full border-y-0 border-r-0 outline-none",
            isMobileMenuOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-popover-foreground">
              Menu
            </span>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Fechar menu"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <ul className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {primary.map((item) => renderLink(item, true))}
            {isLoggedOut && (
              <li className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onStaffLogin({ mode: "registration" });
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-accent"
                >
                  <UserPlus className="h-4 w-4" />
                  Registar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onStaffLogin({ mode: "login" });
                  }}
                  className="rally-bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                >
                  <LogIn className="h-4 w-4" />
                  Iniciar sessão
                </button>
                <Link
                  to="/team-login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-accent"
                >
                  <Users className="h-4 w-4" />
                  Código de Equipa
                </Link>
              </li>
            )}
            {management.length > 0 && (
              <>
                <li className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Gestão
                </li>
                {management.map((item) => renderLink(item, true))}
              </>
            )}
            <ViewToggle
              isDualRole={isDualRole}
              viewMode={viewMode}
              toggleViewMode={toggleViewMode}
            />
          </ul>
        </dialog>
      </div>
    </div>
  );
}
