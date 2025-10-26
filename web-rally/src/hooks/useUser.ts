import { UserService } from "@/client";
import { useUserStore } from "@/stores/useUserStore";
import { useQuery } from "@tanstack/react-query";

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
