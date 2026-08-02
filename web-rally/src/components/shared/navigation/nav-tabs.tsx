import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { RallyButton } from "@/components/themes/rally";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";
import { useState, useRef } from "react";
import {
  Menu,
  X,
  ShieldCheck,
  Users,
  ChevronDown,
  UserPlus,
  LogIn,
  SlidersHorizontal,
} from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import useGuideAccess from "@/hooks/useGuideAccess";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import useTeamAuth from "@/hooks/useTeamAuth";
import useStaffLogin from "@/hooks/useLoginLink";
import useClickOutside from "@/hooks/useClickOutside";

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

  useClickOutside(ref, open, () => setOpen(false));

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
        type="button"
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

  useClickOutside(mobileMenuRef, isMobileMenuOpen, () => setIsMobileMenuOpen(false));

  const primary: NavLink[] = [
    { name: "Progresso", href: "/team-progress", show: showTeamView },
    { name: "Pontuação", href: "/scoreboard", show: showTeamView && showScoreMenu },
    {
      name: "Conquistas",
      href: "/achievements",
      show: showTeamView && settings?.badges_enabled !== false,
    },
    { name: "Trocar Equipa", href: "/team-login", show: showTeamView },

    { name: "Pontuação", href: "/scoreboard", show: !showTeamView && showScoreMenu },
    {
      name: checkpointsLabel,
      href: "/checkpoints",
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
          type={"button"}
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
          // A `<dialog open>` element sits in the browser's top layer and
          // remains hit-testable even when translated off-screen, so it was
          // silently intercepting clicks on whatever sat behind it whenever
          // the drawer was "closed". `open` alone isn't enough — the
          // unconditional `flex` class overrides the UA stylesheet's
          // `dialog:not([open]) { display: none }` — so pointer-events and
          // visibility are also gated explicitly, keeping the slide
          // transition intact instead of the abrupt cut a `hidden` toggle
          // would cause.
          open={isMobileMenuOpen || undefined}
          aria-modal="true"
          aria-label="Menu"
          // `left-auto` is required: the UA stylesheet sets
          // `inset-inline-start: 0` on `dialog`, and on WebKit (iOS/iPadOS 26,
          // macOS Tahoe) that wins over `right-0` for a fixed-width box, which
          // pinned the drawer to the *left* edge. Explicitly clearing `left`
          // makes `right-0` authoritative on every engine.
          className={cn(
            "rally-elevate fixed inset-y-0 left-auto right-0 z-50 m-0 flex h-full max-h-none w-72 max-w-[85vw] flex-col border-y-0 border-l border-r-0 border-border bg-popover outline-none transition-transform duration-300 ease-out",
            isMobileMenuOpen ? "translate-x-0" : "pointer-events-none invisible translate-x-full",
          )}
          style={{
            // 20px floor on top: see RallyNavbar — landscape reports a 0px top
            // inset but iOS still eats touches in that strip.
            paddingTop: "max(20px, var(--safe-top))",
            paddingBottom: "var(--safe-bottom)",
            paddingRight: "var(--safe-right)",
            paddingLeft: "var(--safe-left)",
          }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-popover-foreground">
              Menu
            </span>
            <button
              type={"button"}
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
                <RallyButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onStaffLogin({ mode: "login" });
                  }}
                  className="w-full rounded-md px-3 py-2.5 text-xs font-bold uppercase tracking-wider"
                >
                  <LogIn className="h-4 w-4" />
                  Iniciar sessão
                </RallyButton>
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
            {/* Device-local preferences: no account required, so this sits
                outside every role gate above. */}
            <li className="border-t border-border pt-2">
              <Link
                to="/preferences"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-2",
                  linkClass(location.pathname === "/preferences", true),
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Preferências
              </Link>
            </li>
          </ul>
        </dialog>
      </div>
    </div>
  );
}
