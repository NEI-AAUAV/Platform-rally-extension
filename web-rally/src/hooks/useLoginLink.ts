import config from "@/config";
import { useHref } from "react-router-dom";

/**
 * Hook to generate login link with redirect parameter
 * 
 * Creates a login URL that redirects back to the current page after authentication.
 * Uses the current route pathname to construct the redirect URL.
 * 
 * @returns Full login URL with redirect_to query parameter
 * 
 * @example
 * ```tsx
 * const loginLink = useLoginLink();
 * // Returns: "https://nei.web.ua.pt/auth/login?redirect_to=https://nei.web.ua.pt/rally/scoreboard"
 * window.location.href = loginLink;
 * ```
 */
export default function useLoginLink() {
  const homePathname = useHref("");
  const loginURL = new URL("/auth/login", config.BASE_URL);
  const redirectUrl = new URL(homePathname, config.BASE_URL);

  loginURL.searchParams.set("redirect_to", redirectUrl.toString());

  return loginURL.toString();
}
