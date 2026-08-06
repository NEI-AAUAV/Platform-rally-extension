import { create } from "zustand";

const VIEW_MODE_KEY = "rally_view_mode";

export type ViewMode = "team" | "staff";

/**
 * Persisted per-device preference for dual-role users (team + staff/admin/
 * guide) choosing which nav surface to see. A zustand store rather than
 * component-local state — NavTabs (desktop) and MobileBottomNav each used to
 * carry their own copy, so toggling the view on one surface didn't update
 * the other: a dual-role user could see "Equipa"/"Definições" on mobile but
 * have them hidden behind the toggle on desktop (still defaulted to
 * "staff"), or vice versa. One store keeps every consumer in agreement.
 */
interface ViewModeState {
  viewMode: ViewMode;
  toggle: () => void;
}

function readInitial(): ViewMode {
  if (typeof window === "undefined") return "staff";
  return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? "staff";
}

/**
 * Dual-role users (staff/admin who are also on a team) toggle which nav they
 * see. Was per-component `useState` in `nav-tabs.tsx` — toggling on desktop
 * never updated `MobileBottomNav`'s own copy, and vice versa. Shared store
 * so both read the same value and both re-render on toggle.
 */
export const useViewModeStore = create<ViewModeState>((set, get) => ({
  viewMode: readInitial(),
  toggle: () => {
    const next: ViewMode = get().viewMode === "staff" ? "team" : "staff";
    localStorage.setItem(VIEW_MODE_KEY, next);
    set({ viewMode: next });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== VIEW_MODE_KEY) return;
    useViewModeStore.setState({ viewMode: readInitial() });
  });
}
