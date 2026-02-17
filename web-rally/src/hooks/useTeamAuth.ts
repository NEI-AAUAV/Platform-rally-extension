import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TeamService, TeamMembersService, type DetailedTeam } from "@/client";

interface TeamLoginRequest {
  access_code: string;
}

interface TeamLoginResponse {
  access_token: string;
  token_type: string;
  team_id: number;
  team_name: string;
}

interface TeamTokenData {
  team_id: number;
  team_name: string;
}

const TEAM_TOKEN_KEY = "rally_team_token";
const TEAM_DATA_KEY = "rally_team_data";

/**
 * Hook for team authentication
 * Provides login, logout, and authentication state management
 */
export default function useTeamAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teamData, setTeamData] = useState<TeamTokenData | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const queryClient = useQueryClient();

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem(TEAM_TOKEN_KEY);
    const data = localStorage.getItem(TEAM_DATA_KEY);

    if (token && data) {
      try {
        const parsedData = JSON.parse(data) as TeamTokenData;
        setTeamData(parsedData);
        setIsAuthenticated(true);
      } catch (error) {
        // Invalid data, clear storage
        localStorage.removeItem(TEAM_TOKEN_KEY);
        localStorage.removeItem(TEAM_DATA_KEY);
      }
    }
    setIsLoadingAuth(false);
  }, []);

  // Fetch team members data when authenticated
  const { data: team, isLoading: isLoadingTeam } = useQuery<DetailedTeam>({
    queryKey: ["team", teamData?.team_id],
    queryFn: () => 
      teamData ? TeamService.getTeamByIdApiRallyV1TeamIdGet(teamData.team_id) : Promise.reject(),
    enabled: isAuthenticated && !!teamData?.team_id,
    staleTime: 0,
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (accessCode: string): Promise<TeamLoginResponse> => {
      const response = await fetch("/api/rally/v1/team-auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_code: accessCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Login failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Store token and team data
      localStorage.setItem(TEAM_TOKEN_KEY, data.access_token);
      localStorage.setItem(
        TEAM_DATA_KEY,
        JSON.stringify({
          team_id: data.team_id,
          team_name: data.team_name,
        })
      );

      setTeamData({
        team_id: data.team_id,
        team_name: data.team_name,
      });
      setIsAuthenticated(true);
    },
  });

  // Add member mutation
  const { mutate: addMember, isPending: isAddingMember } = useMutation({
    mutationFn: async (memberData: { name: string; email?: string | null }) => {
      if (!teamData?.team_id) throw new Error("Team ID not found");
      return TeamMembersService.addTeamMemberApiRallyV1TeamTeamIdMembersPost(
        teamData.team_id,
        memberData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamData?.team_id] });
    },
  });

  // Remove member mutation
  const { mutate: removeMember, isPending: isRemovingMember } = useMutation({
    mutationFn: async (memberId: number) => {
      if (!teamData?.team_id) throw new Error("Team ID not found");
      return TeamMembersService.removeTeamMemberApiRallyV1TeamTeamIdMembersUserIdDelete(
        teamData.team_id,
        memberId
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamData?.team_id] });
    },
  });

  const login = (accessCode: string) => {
    return loginMutation.mutateAsync(accessCode);
  };

  const logout = () => {
    localStorage.removeItem(TEAM_TOKEN_KEY);
    localStorage.removeItem(TEAM_DATA_KEY);
    setIsAuthenticated(false);
    setTeamData(null);
    queryClient.invalidateQueries({ queryKey: ["team"] });
  };

  const getToken = (): string | null => {
    return localStorage.getItem(TEAM_TOKEN_KEY);
  };

  return {
    isAuthenticated,
    teamData,
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
