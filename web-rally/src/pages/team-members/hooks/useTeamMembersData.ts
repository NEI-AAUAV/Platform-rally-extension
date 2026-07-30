import { useQuery } from "@tanstack/react-query";
import { getTeams, getTeamById, getTeamMembers } from "@/client";
import type { ListingTeam, TeamMemberResponse, DetailedTeam } from "@/client";

export function useTeamMembersData(
  selectedTeam: string,
  options: { fetchMembers?: boolean; fetchTeamData?: boolean } = {},
) {
  const { fetchMembers = true, fetchTeamData = true } = options;

  const teamsQuery = useQuery<ListingTeam[]>({
    queryKey: ["teams"],
    queryFn: async () => (await getTeams()).data,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  const membersQuery = useQuery<TeamMemberResponse[]>({
    queryKey: ["teamMembers", selectedTeam],
    queryFn: async () => {
      if (!selectedTeam) return [];
      const { data } = await getTeamMembers({ path: { team_id: Number(selectedTeam) } });
      return data;
    },
    enabled: !!selectedTeam && fetchMembers,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  const teamDataQuery = useQuery<DetailedTeam>({
    queryKey: ["team", selectedTeam],
    queryFn: async () => (await getTeamById({ path: { id: Number(selectedTeam) } })).data,
    enabled: !!selectedTeam && fetchTeamData,
  });

  return { teamsQuery, membersQuery, teamDataQuery };
}
