import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTeamDetails } from '@/pages/teams/[id]/useTeamDetails';
import {
  getCheckpoints,
  getCheckpointsCount,
  getTeamById,
  getTeamEvaluations,
  getTeams,
  getAllEvaluations,
} from '@/client';

const { mockUseRallySettings } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/client', () => ({
  getCheckpoints: vi.fn(),
  getCheckpointsCount: vi.fn(),
  getTeamById: vi.fn(),
  getTeamEvaluations: vi.fn(),
  getTeams: vi.fn(),
  getAllEvaluations: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTeamDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({ settings: { show_team_details: true } });
    vi.mocked(getTeamById).mockResolvedValue({ data: { id: 1, name: 'Team A', total: 10 } } as never);
    vi.mocked(getCheckpoints).mockResolvedValue({ data: [{ id: 1, order: 1 }] } as never);
    vi.mocked(getAllEvaluations).mockResolvedValue({
      data: { evaluations: [{ team_id: 1, final_score: 5 }] },
    } as never);
    vi.mocked(getTeamEvaluations).mockResolvedValue({
      data: { evaluations: [{ team_id: 1, final_score: 7 }] },
    } as never);
    vi.mocked(getTeams).mockResolvedValue({ data: [{ id: 1 }, { id: 2 }] } as never);
    vi.mocked(getCheckpointsCount).mockResolvedValue({ data: 5 } as never);
  });

  it('loads team, checkpoints, evaluations, and totals', async () => {
    const { result } = renderHook(() => useTeamDetails('1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.team?.name).toBe('Team A');
    await waitFor(() => expect(result.current.totalTeams).toBe(2));
    await waitFor(() => expect(result.current.totalCount).toBe(5));
    expect(result.current.activityResults).toEqual([{ team_id: 1, final_score: 7 }]);
  });

  it('returns an empty evaluations array when the team-scoped call fails (caught internally)', async () => {
    vi.mocked(getTeamEvaluations).mockRejectedValue(new Error('403'));
    const { result } = renderHook(() => useTeamDetails('1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => {
      expect(result.current.activityResults).toEqual([]);
    });
  });

  it('does not fetch team-scoped evaluations or counts when show_team_details is false', async () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_team_details: false } });
    const { result } = renderHook(() => useTeamDetails('1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getTeamEvaluations).not.toHaveBeenCalled();
    expect(getCheckpointsCount).not.toHaveBeenCalled();
  });

  it('handles allEvaluations fetch failure gracefully', async () => {
    vi.mocked(getAllEvaluations).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTeamDetails('1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.allEvaluations).toEqual([]));
  });

  it('handles undefined id', async () => {
    const { result } = renderHook(() => useTeamDetails(undefined), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
