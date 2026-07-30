import useRallySettings from "@/hooks/useRallySettings";
import { resolveBranding, type Branding } from "@/lib/branding";

/**
 * Effective branding (event name, banner, logo, favicon, accent) resolved from
 * the public rally settings with bundled fallbacks. Shares the React Query
 * cache with {@link useRallySettings}, so it adds no extra network request.
 */
export default function useBranding(): { branding: Branding; isLoading: boolean } {
  const { settings, isLoading } = useRallySettings();
  return { branding: resolveBranding(settings), isLoading };
}
