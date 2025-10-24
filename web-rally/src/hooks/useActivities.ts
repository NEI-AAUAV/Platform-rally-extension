import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityCreate, ActivityUpdate } from "@/types/activityTypes";
import { activityService } from "@/services/activityService";
import useUser from "@/hooks/useUser";

export function useActivities() {
  const { userStoreStuff } = useUser();
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  return useQuery({
    queryKey: ["activities"],
    queryFn: () => activityService.getActivities(userStoreStuff.token || ""),
    enabled: isManager && !!userStoreStuff.token,
  });
}

export function useCreateActivity() {
  const { userStoreStuff } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activity: ActivityCreate) => 
      activityService.createActivity(activity, userStoreStuff.token || ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useUpdateActivity() {
  const { userStoreStuff } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, activity }: { id: number; activity: ActivityUpdate }) =>
      activityService.updateActivity(id, activity, userStoreStuff.token || ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useDeleteActivity() {
  const { userStoreStuff } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => activityService.deleteActivity(id, userStoreStuff.token || ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
