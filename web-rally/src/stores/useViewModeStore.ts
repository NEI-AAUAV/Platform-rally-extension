import { create } from "zustand";

const VIEW_MODE_KEY = "rally_view_mode";
export type ViewMode = "team" | "staff";

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
