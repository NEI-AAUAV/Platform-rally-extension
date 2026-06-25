import { Link } from "@tanstack/react-router";
import type { Branding } from "@/lib/branding";
import NavTabs from "./nav-tabs";
import { UserMenu } from "./user-menu";

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

/**
 * The app's primary navigation bar: a sticky, neo-brutalist strip carrying the
 * compact event brand, the nav links (NavTabs, which also owns the view toggle
 * and the mobile menu) and the user menu.
 */
export function RallyNavbar({ branding }: RallyNavbarProps) {
  const { eventName, logoSrc } = branding;

  return (
    <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5"
      >
        {/* Brand */}
        <Link to="/" className="brutal-press flex shrink-0 items-center gap-2.5">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={eventName}
              className="h-9 w-9 border-2 border-foreground object-contain"
            />
          ) : (
            <span className="rally-bg-accent grid h-9 w-9 place-items-center border-2 border-foreground text-sm font-bold text-white brutal-shadow-sm">
              {initialsOf(eventName)}
            </span>
          )}
          <span className="rally-display hidden max-w-[14ch] truncate text-lg font-bold text-white sm:inline">
            {eventName}
          </span>
        </Link>

        {/* Nav links (desktop inline / mobile dropdown live inside NavTabs) */}
        <div className="flex flex-1 justify-end sm:justify-center">
          <NavTabs className="justify-end" />
        </div>

        {/* User / auth */}
        <div className="shrink-0">
          <UserMenu />
        </div>
      </nav>
    </header>
  );
}

export default RallyNavbar;
