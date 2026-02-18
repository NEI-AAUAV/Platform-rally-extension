import useRallySettings from "./useRallySettings";

/**
 * Returns the appropriate fallback navigation path based on admin settings.
 * When a non-admin user tries to access an admin page, they should be redirected to:
 * - /postos if score display is completely hidden
 * - /scoreboard otherwise (for viewing their score/team progress)
 */
export default function useFallbackNavigation(): string {
  const { settings } = useRallySettings();

  // If score mode is "hidden", redirect to checkpoints page
  if (settings?.show_score_mode === "hidden") {
    return "/postos";
  }

  // Otherwise, redirect to scoreboard
  return "/scoreboard";
}
