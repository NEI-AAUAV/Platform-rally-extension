import { UserService } from "@/client";
import { useUserStore } from "@/stores/useUserStore";
import { useQuery } from "@tanstack/react-query";

export default function useUser() {
  const { sessionLoading, ...userStoreStuff } = useUserStore((state) => state);
  const { data, isLoading, ...rest } = useQuery({
    queryKey: ["userMe"],
    queryFn: UserService.getMeApiRallyV1UserMeGet,
  });

  const isRallyAdmin =
    !!userStoreStuff.scopes?.includes("admin") ||
    !!userStoreStuff.scopes?.includes("manager-rally");

  return {
    isLoading: isLoading || sessionLoading,
    userData: data,
    isRallyAdmin,
    ...rest,
    userStoreStuff,
  };
}
