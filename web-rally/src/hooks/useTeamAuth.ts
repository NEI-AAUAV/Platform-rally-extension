import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTeamById,
  addTeamMember,
  removeTeamMember,
  teamLogin,
  type PrivilegedDetailedTeam,
} from "@/client";
import { ApiError } from "@/services/apiClient";
import { getTeamToken } from "@/lib/auth/tokenStore";
import { useTeamAuthStore } from "@/stores/useTeamAuthStore";

interface TeamLoginResponse {
  access_token: string;
  token_type: string;
  team_id: number;
  team_name: string;
}

/**
 * Hook for team authentication.
 *
 * State lives in `useTeamAuthStore` (Zustand) so login/logout in one
 * component is immediately visible to every other mounted consumer — see
 * that store's docstring for why. This hook is the thin per-render wrapper:
 * store state plus the React Query pieces (team fetch, member mutations)
 * that legitimately need a query client.
 */
export default function useTeamAuth() {
  const { isAuthenticated, teamData: currentTeamData, isLoadingAuth, setAuth, clearAuth } =
    useTeamAuthStore();
  const queryClient = useQueryClient();

  // Fetch team members data when authenticated
  const { data: team, isLoading: isLoadingTeam } = useQuery<PrivilegedDetailedTeam>({
    queryKey: ["team", currentTeamData?.team_id],
    queryFn: async () => {
      if (!currentTeamData) {
        throw new Error("No team data");
      }
      const { data } = await getTeamById({ path: { id: currentTeamData.team_id } });
      return data;
    },
    enabled: isAuthenticated && !!currentTeamData?.team_id,
    staleTime: 0,
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (accessCode: string): Promise<TeamLoginResponse> => {
      try {
        const { data } = await teamLogin({ body: { access_code: accessCode } });
        return data as TeamLoginResponse;
      } catch (error) {
        if (error instanceof ApiError) {
          const detail = (error.body as { detail?: string } | undefined)?.detail;
          throw new Error(detail || "Login failed");
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      setAuth({ team_id: data.team_id, team_name: data.team_name }, data.access_token);
    },
  });

  // Add member mutation
  const { mutate: addMember, isPending: isAddingMember } = useMutation({
    mutationFn: async (memberData: { name: string; email?: string | null }) => {
      if (!currentTeamData?.team_id) throw new Error("Team ID not found");
      return addTeamMember({
        path: { team_id: currentTeamData.team_id },
        body: memberData,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team", currentTeamData?.team_id] });
    },
  });

  // Remove member mutation
  const { mutate: removeMember, isPending: isRemovingMember } = useMutation({
    mutationFn: async (memberId: number) => {
      if (!currentTeamData?.team_id) throw new Error("Team ID not found");
      return removeTeamMember({
        path: { team_id: currentTeamData.team_id, user_id: memberId },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team", currentTeamData?.team_id] });
    },
  });

  const login = (accessCode: string) => {
    return loginMutation.mutateAsync(accessCode);
  };

  const logout = () => {
    clearAuth();
    void queryClient.invalidateQueries({ queryKey: ["team"] });
  };

  const getToken = (): string | null => {
    return getTeamToken();
  };

  return {
    isAuthenticated,
    teamData: currentTeamData,
    team,
    isLoading: isLoadingAuth || isLoadingTeam,
    login,
    logout,
    getToken,
    addMember,
    removeMember,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    isAddingMember,
    isRemovingMember,
  };
}
