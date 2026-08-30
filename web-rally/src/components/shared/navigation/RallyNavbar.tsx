import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Branding } from "@/lib/branding";
import NavTabs from "./nav-tabs";
import { UserMenu } from "./user-menu";
import { ColorModeToggle } from "@/components/theme";
import { useUserStore } from "@/stores/useUserStore";
import { useEvents, useEventMutations } from "@/hooks/useEvents";
import useClickOutside from "@/hooks/useClickOutside";

interface RallyNavbarProps {
  readonly branding: Branding;
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

/** Compact event-switcher shown only to admin/manager users. */
function EventSwitcher({ eventName }: { readonly eventName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: events } = useEvents();
  const { setCurrent } = useEventMutations();

  useClickOutside(ref, open, () => setOpen(false));

  const currentEventId = (events ?? []).find((ev) => ev.is_current)?.id ?? "";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        // The event-name span is hidden below the `sm` breakpoint, so the
        // button would otherwise have no accessible name on mobile viewports.
        aria-label={`Edição atual: ${eventName}`}
        className="rally-press flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent"
      >
        <span className="rally-display hidden max-w-[16ch] truncate text-xs font-black uppercase tracking-tight text-foreground sm:inline sm:text-sm">
          {eventName}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 pt-2">
          <select
            aria-label="Selecionar evento"
            value={currentEventId}
            disabled={setCurrent.isPending}
            onChange={(e) => {
              setCurrent.mutate(Number(e.target.value));
              setOpen(false);
            }}
            className="rally-elevate min-w-[14rem] overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-xs font-bold uppercase tracking-wider text-foreground"
            size={Math.min((events ?? []).length || 1, 8)}
          >
            {(events ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/**
 * The app's primary navigation bar: a sticky, soft-depth strip carrying the
 * compact event brand, the nav links (NavTabs, which also owns the view toggle
 * and the mobile overflow menu), the color-mode toggle and the user menu.
 */
export function RallyNavbar({ branding }: RallyNavbarProps) {
  const { eventName, logoSrc } = branding;
  const { scopes } = useUserStore((state) => state);
  const isAdminOrManager =
    scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally"));

  return (
    // .rally-topbar-inset is the safe-area padding: plain env() everywhere,
    // raised to a 20px floor on iOS only, where landscape reports a 0px inset
    // but the top edge still swallows touches. It used to be an inline
    // max(20px, …), which put that iOS workaround on every platform — a
    // permanent 20px band above the navbar on desktop and Android.
    <header className="rally-glass rally-topbar-inset sticky top-0 z-40 border-b border-border shadow-[var(--rally-shadow-sm)]">
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5"
      >
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-2.5">
          <Link to="/" className="rally-press flex shrink-0 items-center gap-2">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={eventName}
                className="h-8 w-8 rounded-lg object-contain sm:h-9 sm:w-9"
              />
            ) : (
              <span className="rally-bg-accent grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white shadow-[var(--rally-shadow-sm)] sm:h-9 sm:w-9 sm:text-sm">
                {initialsOf(eventName)}
              </span>
            )}
          </Link>
          {isAdminOrManager ? (
            <EventSwitcher eventName={eventName} />
          ) : (
            <span className="rally-display hidden max-w-[16ch] truncate text-xs font-black uppercase tracking-tight text-foreground sm:inline sm:text-sm">
              {eventName}
            </span>
          )}
        </div>

        {/* Nav links (desktop inline / mobile overflow live inside NavTabs) */}
        <div className="flex flex-1 items-center justify-end gap-2 sm:justify-center">
          {/* Lamp sits left of the hamburger on mobile */}
          <ColorModeToggle className="sm:hidden" />
          <NavTabs branding={branding} />
        </div>

        {/* Controls. On mobile the lamp moves next to the hamburger and the
            logged-out login buttons live in the sidebar, so this slot only
            shows the desktop lamp plus the (mobile-aware) user menu. */}
        <div className="flex shrink-0 items-center gap-2">
          <ColorModeToggle className="hidden sm:inline-flex" />
          <UserMenu />
        </div>
      </nav>
    </header>
  );
}

export default RallyNavbar;
