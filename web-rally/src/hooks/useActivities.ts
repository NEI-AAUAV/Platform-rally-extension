import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityCreate, ActivityUpdate } from "@/types/activityTypes";
import { activityService } from "@/services/activityService";
import useUser from "@/hooks/useUser";

export function useActivities() {
  const userStore = useUser();
  const isManager = userStore.scopes?.includes("manager-rally") || 
                   userStore.scopes?.includes("admin");

  return useQuery({
    queryKey: ["activities"],
    queryFn: () => activityService.getActivities(userStore.token || ""),
    enabled: isManager && !!userStore.token,
  });
}

export function useCreateActivity() {
  const userStore = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activity: ActivityCreate) => 
      activityService.createActivity(activity, userStore.token || ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useUpdateActivity() {
  const userStore = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, activity }: { id: number; activity: ActivityUpdate }) =>
      activityService.updateActivity(id, activity, userStore.token || ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useDeleteActivity() {
  const userStore = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => activityService.deleteActivity(id, userStore.token || ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
