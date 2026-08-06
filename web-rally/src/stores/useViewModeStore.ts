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
  toggleViewMode: () => void;
}

function readInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "staff";
  return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? "staff";
}

export const useViewModeStore = create<ViewModeState>((set) => ({
  viewMode: readInitialViewMode(),
  toggleViewMode: () =>
    set((state) => {
      const next: ViewMode = state.viewMode === "staff" ? "team" : "staff";
      localStorage.setItem(VIEW_MODE_KEY, next);
      return { viewMode: next };
    }),
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== VIEW_MODE_KEY) return;
    useViewModeStore.setState({ viewMode: readInitialViewMode() });
  });
}
