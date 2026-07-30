import type { RallySettingsResponse } from "@/client";

// Extended interface to include missing properties
export type ExtendedRallySettingsResponse = Omit<
  RallySettingsResponse,
  "participant_view_enabled" | "show_route_mode" | "show_score_mode"
> & {
  participant_view_enabled?: boolean;
  show_route_mode?: "focused" | "complete";
  show_score_mode?: "hidden" | "individual" | "competitive";
};
