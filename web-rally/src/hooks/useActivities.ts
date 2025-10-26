import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import { ActivitiesService } from "@/client";
import { type ActivityCreate, type ActivityUpdate } from "@/client";

export function useActivities() {
  const { userStore } = useUser();
  const isManager = userStore.scopes?.includes("manager-rally") || 
                   userStore.scopes?.includes("admin");

  return useQuery({
    queryKey: ["activities"],
    queryFn: () => ActivitiesService.getActivitiesApiRallyV1ActivitiesGet(),
    enabled: isManager && !!userStore.token,
  });
}

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

export function useDeleteActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => ActivitiesService.deleteActivityApiRallyV1ActivitiesActivityIdDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
