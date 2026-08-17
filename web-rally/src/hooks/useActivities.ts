import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import { getActivities, createActivity, updateActivity, deleteActivity } from "@/client";
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
    queryFn: async () => (await getActivities()).data,
    enabled: isRallyAdmin && !!userStore.token,
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
    mutationFn: async (activity: ActivityCreate) => (await createActivity({ body: activity })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      // A new activity can flip a checkpoint's "sem desafio" readiness badge,
      // which reads from this query rather than ["activities"].
      void queryClient.invalidateQueries({ queryKey: ["route-status"] });
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
    mutationFn: async ({ id, activity }: { id: number; activity: ActivityUpdate }) =>
      (await updateActivity({ path: { activity_id: id }, body: activity })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      // Editing is_active or moving the activity to another checkpoint can
      // flip the "sem desafio" readiness badge, which reads this query.
      void queryClient.invalidateQueries({ queryKey: ["route-status"] });
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
    mutationFn: async (id: number) => (await deleteActivity({ path: { activity_id: id } })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      // Deleting the last activity on a checkpoint should bring back the
      // "sem desafio" badge, which reads this query, not ["activities"].
      void queryClient.invalidateQueries({ queryKey: ["route-status"] });
    },
  });
}
