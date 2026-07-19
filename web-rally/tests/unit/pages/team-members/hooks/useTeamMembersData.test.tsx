import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTeamMembersData } from '@/pages/team-members/hooks/useTeamMembersData';
import { getTeams, getTeamById, getTeamMembers } from '@/client';

vi.mock('@/client', () => ({
  getTeams: vi.fn(),
  getTeamById: vi.fn(),
  getTeamMembers: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTeamMembersData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTeams).mockResolvedValue({ data: [{ id: 1, name: 'Team A' }] } as never);
    vi.mocked(getTeamMembers).mockResolvedValue({ data: [{ id: 1, name: 'Alice' }] } as never);
    vi.mocked(getTeamById).mockResolvedValue({ data: { id: 1, name: 'Team A' } } as never);
  });

  it('fetches teams always', async () => {
    const { result } = renderHook(() => useTeamMembersData(''), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.teamsQuery.isSuccess).toBe(true));
    expect(getTeams).toHaveBeenCalled();
  });

  it('does not fetch members or team data when no team is selected', async () => {
    const { result } = renderHook(() => useTeamMembersData(''), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.teamsQuery.isSuccess).toBe(true));
    expect(result.current.membersQuery.fetchStatus).toBe('idle');
    expect(result.current.teamDataQuery.fetchStatus).toBe('idle');
  });

  it('fetches members and team data when a team is selected with defaults', async () => {
    const { result } = renderHook(() => useTeamMembersData('1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.membersQuery.isSuccess).toBe(true));
    expect(getTeamMembers).toHaveBeenCalledWith({ path: { team_id: 1 } });
    await waitFor(() => expect(result.current.teamDataQuery.isSuccess).toBe(true));
    expect(getTeamById).toHaveBeenCalledWith({ path: { id: 1 } });
  });

  it('respects fetchMembers=false and fetchTeamData=false options', async () => {
    const { result } = renderHook(
      () => useTeamMembersData('1', { fetchMembers: false, fetchTeamData: false }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.teamsQuery.isSuccess).toBe(true));
    expect(result.current.membersQuery.fetchStatus).toBe('idle');
    expect(result.current.teamDataQuery.fetchStatus).toBe('idle');
    expect(getTeamMembers).not.toHaveBeenCalled();
    expect(getTeamById).not.toHaveBeenCalled();
  });
});
