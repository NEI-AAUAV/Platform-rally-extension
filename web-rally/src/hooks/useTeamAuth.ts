import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTeamById,
  addTeamMember,
  removeTeamMember,
  teamLogin,
  type DetailedTeam,
} from "@/client";
import { ApiError } from "@/services/apiClient";
import {
  getTeamToken,
  setTeamToken,
  getTeamData,
  setTeamData,
  hasTeamData,
  clearTeamAuth,
  type TeamTokenData,
} from "@/lib/auth/tokenStore";

interface TeamLoginResponse {
  access_token: string;
  token_type: string;
  team_id: number;
  team_name: string;
}

/**
 * Hook for team authentication
 * Provides login, logout, and authentication state management
 */
export default function useTeamAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentTeamData, setCurrentTeamData] = useState<TeamTokenData | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const queryClient = useQueryClient();

  // Check for existing token on mount
  useEffect(() => {
    const token = getTeamToken();
    const data = getTeamData();

    if (token && data) {
      setCurrentTeamData(data);
      setIsAuthenticated(true);
    } else if (token && hasTeamData()) {
      // Token present and a data entry exists but is corrupt — clear stale storage.
      clearTeamAuth();
    }
    setIsLoadingAuth(false);
  }, []);

  // Fetch team members data when authenticated
  const { data: team, isLoading: isLoadingTeam } = useQuery<DetailedTeam>({
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
      // Store token and team data
      const teamTokenData: TeamTokenData = {
        team_id: data.team_id,
        team_name: data.team_name,
      };
      setTeamToken(data.access_token);
      setTeamData(teamTokenData);

      setCurrentTeamData(teamTokenData);
      setIsAuthenticated(true);
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
    clearTeamAuth();
    setIsAuthenticated(false);
    setCurrentTeamData(null);
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
