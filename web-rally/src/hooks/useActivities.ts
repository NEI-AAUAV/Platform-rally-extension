import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import { ActivitiesService } from "@/client";
import { type ActivityCreate, type ActivityUpdate } from "@/client";

/**
 * Hook to fetch activities list
 * 
 * Only enabled for users with manager-rally or admin scope.
 * Automatically disabled if user is not a manager or token is missing.
 * 
 * @returns React Query result with activities list
 * @example
 * ```tsx
 * const { data: activities, isLoading } = useActivities();
 * ```
 */
export function useActivities() {
  const { isRallyAdmin, userStore } = useUser();

  return useQuery({
    queryKey: ["activities"],
    queryFn: () => ActivitiesService.getActivitiesApiRallyV1ActivitiesGet(),
    enabled: isRallyAdmin,
  });
}

/**
 * Hook to create a new activity
 * 
 * Automatically invalidates the activities query cache on success.
 * 
 * @returns React Query mutation for creating activities
 * @example
 * ```tsx
 * const createActivity = useCreateActivity();
 * createActivity.mutate({
 *   name: "New Activity",
 *   activity_type: "GeneralActivity",
 *   checkpoint_id: 1
 * });
 * ```
 */
export function useCreateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activity: ActivityCreate) => 
      ActivitiesService.createActivityApiRallyV1ActivitiesPost(activity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

/**
 * Hook to update an existing activity
 * 
 * Automatically invalidates the activities query cache on success.
 * 
 * @returns React Query mutation for updating activities
 * @example
 * ```tsx
 * const updateActivity = useUpdateActivity();
 * updateActivity.mutate({
 *   id: 1,
 *   activity: { name: "Updated Activity" }
 * });
 * ```
 */
export function useUpdateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, activity }: { id: number; activity: ActivityUpdate }) =>
      ActivitiesService.updateActivityApiRallyV1ActivitiesActivityIdPut(id, activity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

/**
 * Hook to delete an activity
 * 
 * Automatically invalidates the activities query cache on success.
 * 
 * @returns React Query mutation for deleting activities
 * @example
 * ```tsx
 * const deleteActivity = useDeleteActivity();
 * deleteActivity.mutate(1); // Delete activity with ID 1
 * ```
 */
export function useDeleteActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => ActivitiesService.deleteActivityApiRallyV1ActivitiesActivityIdDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
