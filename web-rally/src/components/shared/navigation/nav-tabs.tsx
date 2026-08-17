import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { isNavItemActive } from "./activeRoute";
import { RallyButton } from "@/components/themes/rally";
import type { ComponentProps } from "react";
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
  TrendingUp,
  Trophy,
  MapPin,
  Award,
  Settings,
  Repeat,
  ClipboardCheck,
  UserCog,
  BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import useGuideAccess from "@/hooks/useGuideAccess";
import useEventTerms from "@/hooks/useEventTerms";
import { capitalize } from "@/lib/eventTerms";
import useNavAudience from "@/hooks/useNavAudience";
import type { ViewMode } from "@/stores/useViewModeStore";
import useStaffLogin from "@/hooks/useLoginLink";
import useClickOutside from "@/hooks/useClickOutside";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import type { Branding } from "@/lib/branding";

interface NavTabsProps extends ComponentProps<"ul"> {
  /** Event identity shown in the mobile drawer header. */
  readonly branding?: Pick<Branding, "eventName" | "logoSrc">;
}

interface NavLink {
  readonly name: string;
  readonly href: string;
  readonly show: boolean;
  /** Rendered in the mobile drawer only; the desktop bar stays text-only. */
  readonly icon?: LucideIcon;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The drawer deliberately drops the uppercase/tracking treatment the desktop
 * bar uses: at drawer width a column of wide-tracked caps reads as a wall of
 * noise. Caps survive only on the section headers, where they earn their keep
 * as a hierarchy signal.
 */
const linkClass = (isActive: boolean, isSidebar = false) =>
  isSidebar
    ? cn(
        "rally-press relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
        isActive
          ? "rally-accent bg-accent"
          : "text-foreground/80 hover:bg-accent hover:text-foreground",
      )
    : cn(
        "block rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors",
        isActive ? "rally-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent",
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

  const hasActive = items.some((i) => isNavItemActive(location.pathname, i.href));

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
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
              const isActive = isNavItemActive(location.pathname, item.href);
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

function ViewToggle({
  isDualRole,
  viewMode,
  toggleViewMode,
  isSidebar = false,
}: {
  readonly isDualRole: boolean;
  readonly viewMode: ViewMode;
  readonly toggleViewMode: () => void;
  readonly isSidebar?: boolean;
}) {
  if (!isDualRole) return null;
  const Icon = viewMode === "staff" ? ShieldCheck : Users;
  return (
    <li>
      <button
        type="button"
        onClick={toggleViewMode}
        title={viewMode === "staff" ? "Mudar para vista de equipa" : "Mudar para vista de staff"}
        className={cn(
          "rally-press flex w-full items-center border border-border bg-secondary text-secondary-foreground transition-colors hover:bg-accent",
          isSidebar
            ? "min-h-[44px] gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold"
            : "gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider sm:w-auto",
        )}
      >
        <Icon className={cn("shrink-0", isSidebar ? "h-4 w-4" : "h-3.5 w-3.5")} />
        {isSidebar ? (
          <span>{viewMode === "staff" ? "Vista de staff" : "Vista de equipa"}</span>
        ) : (
          <span className="hidden sm:inline">{viewMode === "staff" ? "Staff" : "Equipa"}</span>
        )}
      </button>
    </li>
  );
}

export default function NavTabs({ className, branding, ...props }: NavTabsProps) {
  const location = useLocation();
  const { settings } = useRallySettings();
  const onStaffLogin = useStaffLogin();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDialogElement>(null);

  const {
    isAdminOrManager,
    isStaff,
    isGuide,
    isPrivileged,
    isTeamAuthenticated,
    isDualRole,
    viewMode,
    toggleViewMode: toggleViewModeShared,
    showTeamView,
    scopes,
  } = useNavAudience();
  const { showGuideFeature } = useGuideAccess();
  const showPostos = isPrivileged || settings?.show_checkpoint_map === true;

  const toggleViewMode = () => {
    toggleViewModeShared();
    setIsMobileMenuOpen(false);
  };

  const showScoreMenu = settings?.show_score_mode !== "hidden";
  const terms = useEventTerms();
  const checkpointsLabel = capitalize(terms.checkpoints);

  useClickOutside(mobileMenuRef, isMobileMenuOpen, () => setIsMobileMenuOpen(false));
  // Back closes the drawer rather than leaving the page behind it.
  useBackDismiss(isMobileMenuOpen, () => setIsMobileMenuOpen(false));

  const primary: NavLink[] = [
    { name: "Progresso", href: "/team-progress", show: showTeamView, icon: TrendingUp },
    {
      name: "Pontuação",
      href: "/scoreboard",
      show: showTeamView && showScoreMenu,
      icon: Trophy,
    },
    {
      name: checkpointsLabel,
      href: "/checkpoints",
      show: showTeamView && showPostos,
      icon: MapPin,
    },
    {
      name: "Conquistas",
      href: "/achievements",
      show: showTeamView && settings?.badges_enabled !== false,
      icon: Award,
    },
    { name: "Equipa", href: "/team-info", show: showTeamView, icon: Users },
    { name: "Definições", href: "/team-settings", show: showTeamView, icon: Settings },
    { name: "Trocar Equipa", href: "/team-login", show: showTeamView, icon: Repeat },

    {
      name: "Pontuação",
      href: "/scoreboard",
      show: !showTeamView && showScoreMenu,
      icon: Trophy,
    },
    {
      name: checkpointsLabel,
      href: "/checkpoints",
      show: !showTeamView && (isPrivileged || settings?.show_checkpoint_map === true),
      icon: MapPin,
    },
  ].filter((item) => item.show);

  const isLoggedOut = !isTeamAuthenticated && scopes === undefined;

  // Admin sees /admin (everything consolidated); staff sees evaluation + members; guides see guide page
  const management: NavLink[] = [
    {
      name: "Admin",
      href: "/admin",
      show: !showTeamView && isAdminOrManager,
      icon: ShieldCheck,
    },
    {
      name: "Avaliação",
      href: "/staff-evaluation",
      show: !showTeamView && (isStaff || isAdminOrManager),
      icon: ClipboardCheck,
    },
    {
      name: "Membros",
      href: "/team-members",
      show: !showTeamView && isStaff && !isAdminOrManager,
      icon: UserCog,
    },
    {
      name: "Guia",
      href: "/guide",
      show: !showTeamView && showGuideFeature && (isGuide || isStaff || isAdminOrManager),
      icon: BookOpen,
    },
  ].filter((item) => item.show);

  const renderLink = (
    item: NavLink,
    { isSidebar = false, liClassName }: { isSidebar?: boolean; liClassName?: string } = {},
  ) => {
    const isActive = isNavItemActive(location.pathname, item.href);
    const Icon = item.icon;
    return (
      <li key={`${item.name}-${item.href}`} className={liClassName}>
        <Link
          to={item.href}
          onClick={() => setIsMobileMenuOpen(false)}
          className={linkClass(isActive, isSidebar)}
        >
          {isSidebar && isActive && (
            <span
              aria-hidden="true"
              className="rally-bg-accent absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
            />
          )}
          {isSidebar && Icon && (
            <Icon className={cn("h-4 w-4 shrink-0", !isActive && "text-muted-foreground")} />
          )}
          {item.name}
        </Link>
      </li>
    );
  };

  const eventName = branding?.eventName ?? "";
  const logoSrc = branding?.logoSrc;

  return (
    <div className="relative">
      {/* Desktop */}
      <ul {...props} className={cn("hidden items-center gap-1 sm:flex", className)}>
        {primary.map((item) => renderLink(item))}
        {management.length > 0 && (
          <>
            {/* From `lg` up there is room to surface the management routes
                inline; below that they'd overflow the bar, so the dropdown
                stays. The two variants are mutually exclusive by breakpoint —
                no media-query state in JS. */}
            <li aria-hidden="true" className="mx-1 hidden h-4 w-px shrink-0 bg-border lg:block" />
            {management.map((item) => renderLink(item, { liClassName: "hidden lg:block" }))}
            <li className="lg:hidden">
              <NavGroup label="Gestão" items={management} />
            </li>
          </>
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
            // The drawer runs the full height of a viewport whose bottom strip
            // already belongs to MobileBottomNav, so it has to clear the tab
            // bar as well as the home indicator — otherwise the footer's auth
            // buttons land underneath it. Same idiom as .rally-sticky-actions
            // and the QR sheet in MobileBottomNav.
            paddingBottom: "calc(var(--safe-bottom) + var(--rally-tabbar-height))",
            paddingRight: "var(--safe-right)",
            paddingLeft: "var(--safe-left)",
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
              ) : (
                eventName && (
                  <span className="rally-bg-accent grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white shadow-[var(--rally-shadow-sm)]">
                    {initialsOf(eventName)}
                  </span>
                )
              )}
              <span className="rally-display truncate text-sm font-black uppercase tracking-tight text-popover-foreground">
                {eventName || "Menu"}
              </span>
            </div>
            <button
              type={"button"}
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Fechar menu"
              // -m-2 p-2 grows the tap target to 44px without shifting the
              // icon's optical alignment with the header row.
              className="-m-2 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <ul className="flex-1 space-y-1 overflow-y-auto p-3">
            {primary.map((item) => renderLink(item, { isSidebar: true }))}
            {management.length > 0 && (
              <>
                <li className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Gestão
                </li>
                {management.map((item) => renderLink(item, { isSidebar: true }))}
              </>
            )}
            <ViewToggle
              isDualRole={isDualRole}
              viewMode={viewMode}
              toggleViewMode={toggleViewMode}
              isSidebar
            />
            {/* Device-local preferences: no account required, so this sits
                outside every role gate above. */}
            <li className="mt-2 border-t border-border pt-2">
              <Link
                to="/preferences"
                onClick={() => setIsMobileMenuOpen(false)}
                className={linkClass(isNavItemActive(location.pathname, "/preferences"), true)}
              >
                <SlidersHorizontal
                  className={cn(
                    "h-4 w-4 shrink-0",
                    !isNavItemActive(location.pathname, "/preferences") && "text-muted-foreground",
                  )}
                />
                Preferências
              </Link>
            </li>
          </ul>

          {/* Auth lives in a fixed footer rather than inline in the scroller:
              inline, three stacked buttons pushed the actual navigation off
              screen. `--safe-bottom` is already applied on the dialog. */}
          {isLoggedOut && (
            <div className="space-y-2 border-t border-border p-3">
              <RallyButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onStaffLogin({ mode: "login" });
                }}
                className="min-h-[44px] w-full rounded-lg px-3 text-sm font-semibold"
              >
                <LogIn className="h-4 w-4" />
                Iniciar sessão
              </RallyButton>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onStaffLogin({ mode: "registration" });
                  }}
                  className="rally-press flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" />
                  Registar
                </button>
                <Link
                  to="/team-login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rally-press flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  Código
                </Link>
              </div>
            </div>
          )}
        </dialog>
      </div>
    </div>
  );
}
