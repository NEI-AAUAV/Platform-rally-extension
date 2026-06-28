import { Link } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Branding } from "@/lib/branding";
import NavTabs from "./nav-tabs";
import { UserMenu } from "./user-menu";
import { ColorModeToggle } from "@/components/theme";
import { useUserStore } from "@/stores/useUserStore";
import { useEvents, useEventMutations } from "@/hooks/useEvents";

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
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
          <ul
            role="listbox"
            aria-label="Selecionar evento"
            className="rally-elevate min-w-[14rem] overflow-hidden rounded-xl border border-border bg-popover p-1.5 space-y-0.5"
          >
            {(events ?? []).map((ev) => {
              const isCurrent = ev.is_current;
              return (
                <li key={ev.id} role="option" aria-selected={isCurrent}>
                  <button
                    type="button"
                    disabled={isCurrent || setCurrent.isPending}
                    onClick={() => {
                      setCurrent.mutate(ev.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-xs font-bold uppercase tracking-wider transition-colors",
                      isCurrent
                        ? "rally-accent cursor-default"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    <Check
                      className={cn("h-3 w-3 shrink-0", isCurrent ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{ev.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
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
    (scopes.includes("admin") ||
      scopes.includes("manager-rally") ||
      scopes.includes("rally:admin"));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card shadow-[var(--rally-shadow-sm)]">
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
        <div className="flex flex-1 justify-end sm:justify-center">
          <NavTabs />
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-2">
          <ColorModeToggle />
          <UserMenu />
        </div>
      </nav>
    </header>
  );
}

export default RallyNavbar;
