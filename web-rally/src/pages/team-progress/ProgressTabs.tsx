import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type ProgressTabId = "agora" | "percurso" | "mapa" | "equipa";

export interface ProgressTab {
  id: ProgressTabId;
  label: string;
  badge?: string;
  panel: ReactNode;
}

const TAB_PARAM = "tab";

function readTabFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(TAB_PARAM);
}

/** Keeps the active tab in `?tab=` so a reload or a shared link lands on the
 * same view. replaceState, not push: switching tabs is not navigation the
 * back button should have to unwind. */
function writeTabToUrl(id: ProgressTabId, isDefault: boolean) {
  const url = new URL(window.location.href);
  if (isDefault) url.searchParams.delete(TAB_PARAM);
  else url.searchParams.set(TAB_PARAM, id);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Phone layout for the team-progress page: one view at a time instead of a
 * single scroll mixing the current task with reference material.
 */
export default function ProgressTabs({ tabs }: Readonly<{ tabs: readonly ProgressTab[] }>) {
  const defaultId = tabs[0]?.id ?? "agora";
  const [active, setActive] = useState<ProgressTabId>(() => {
    const fromUrl = readTabFromUrl();
    return tabs.some((t) => t.id === fromUrl) ? (fromUrl as ProgressTabId) : defaultId;
  });
  const buttonRefs = useRef(new Map<ProgressTabId, HTMLButtonElement>());

  // A tab can disappear while selected (e.g. an admin turns the map off).
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  useEffect(() => {
    if (current) writeTabToUrl(current.id, current.id === defaultId);
  }, [current, defaultId]);

  const select = useCallback((id: ProgressTabId, focus = false) => {
    setActive(id);
    if (focus) buttonRefs.current.get(id)?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!current) return;
    const index = tabs.findIndex((t) => t.id === current.id);
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = tabs[(target + tabs.length) % tabs.length];
    if (next) select(next.id, true);
  };

  if (!current) return null;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Secções do progresso"
        onKeyDown={onKeyDown}
        // Sits just under the floating navbar pill (mt-3 + ~52px tall).
        className="rally-glass rally-glass-solid rally-glass-on-background rally-elevate sticky top-[calc(var(--safe-top)+4.5rem)] z-30 flex gap-1 rounded-2xl border border-border/60 p-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === current.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) buttonRefs.current.set(tab.id, el);
                else buttonRefs.current.delete(tab.id);
              }}
              id={`progress-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`progress-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(tab.id)}
              className={cn(
                "rally-press flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rally-accent)]",
                isActive
                  ? "rally-bg-accent text-white"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.badge && (
                <span
                  className={cn(
                    "rally-num rounded-full px-1.5 text-[10px] font-bold",
                    isActive ? "bg-white/25" : "bg-muted",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        id={`progress-panel-${current.id}`}
        role="tabpanel"
        aria-labelledby={`progress-tab-${current.id}`}
        className="pt-4 duration-300 animate-in fade-in"
      >
        {current.panel}
      </div>
    </div>
  );
}
