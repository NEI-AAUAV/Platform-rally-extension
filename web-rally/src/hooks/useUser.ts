import { UserService } from "@/client";
import { useUserStore } from "@/stores/useUserStore";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to fetch current user data and check admin status
 * 
 * Uses JWT token scopes for authorization (synchronous, no API call needed).
 * Optionally fetches additional user data from API for display purposes.
 * 
 * @param options - Optional configuration
 * @param options.fetchUserData - Whether to fetch user data from API (default: false)
 * 
 * @returns Object containing:
 * - `isLoading`: Loading state (only for API call if enabled)
 * - `userData`: User data from API (if fetchUserData is true)
 * - `isRallyAdmin`: Boolean indicating admin status (from JWT token)
 * - `userStore`: Access to full user store
 * - Other React Query properties (error, refetch, etc.)
 * 
 * @example
 * ```tsx
 * // For authorization only (no API call, instant)
 * const { isRallyAdmin, isLoading } = useUser();
 * 
 * // For authorization + user data display (with API call)
 * const { userData, isRallyAdmin, isLoading } = useUser({ fetchUserData: true });
 * ```
 */
export default function useUser(options?: { fetchUserData?: boolean }) {
  const userStore = useUserStore();
  const token = useUserStore((state) => state.token);
  const sessionLoading = useUserStore((state) => state.sessionLoading);
  
  // By default, don't fetch user data from API (use token scopes for authorization)
  const shouldFetchUserData = options?.fetchUserData ?? false;
  
  const { data, isLoading, error, ...rest } = useQuery({
    queryKey: ["userMe"],
    queryFn: UserService.getMeApiRallyV1UserMeGet,
    // Only fetch if explicitly requested
    enabled: shouldFetchUserData && !!token && !sessionLoading,
    retry: 2,
  });

  // Admin status is determined by JWT token scopes (synchronous, no API call)
  const isRallyAdmin =
    !!userStore.scopes?.includes("admin") ||
    !!userStore.scopes?.includes("manager-rally");

  return {
    // Only show loading state if we're fetching user data
    // Otherwise just show session loading (token parsing from localStorage)
    // Authorization (isRallyAdmin) is always available immediately from token
    isLoading: shouldFetchUserData ? (isLoading || sessionLoading) : sessionLoading,
    userData: data,
    isRallyAdmin,
    error,
    ...rest,
    userStore,
  };
}
