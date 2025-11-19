import { UserService } from "@/client";
import { useUserStore } from "@/stores/useUserStore";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to fetch current user data and check admin status
 * 
 * Combines user data from API with session state from user store.
 * Determines if user is a Rally admin (manager-rally or admin scope).
 * 
 * @returns Object containing:
 * - `isLoading`: Combined loading state (API + session)
 * - `userData`: User data from API
 * - `isRallyAdmin`: Boolean indicating admin status
 * - `userStore`: Access to full user store
 * - Other React Query properties (error, refetch, etc.)
 * 
 * @example
 * ```tsx
 * const { userData, isRallyAdmin, isLoading } = useUser();
 * if (isRallyAdmin) {
 *   // Show admin features
 * }
 * ```
 */
export default function useUser() {
  const userStore = useUserStore();
  const { data, isLoading, ...rest } = useQuery({
    queryKey: ["userMe"],
    queryFn: UserService.getMeApiRallyV1UserMeGet,
  });

  const isRallyAdmin =
    !!userStore.scopes?.includes("admin") ||
    !!userStore.scopes?.includes("manager-rally");

  return {
    isLoading: isLoading || userStore.sessionLoading,
    userData: data,
    isRallyAdmin,
    ...rest,
    userStore,
  };
}
