import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTeamProgress } from '@/pages/team-progress/useTeamProgress';
import { getCheckpoints, getCheckpointsCount, getTeamById } from '@/client';

const {
  mockNavigate,
  mockUseTeamAuth,
  mockUseRallySettings,
  mockUseRallyEventStream,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseTeamAuth: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseRallyEventStream: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/useRallyEventStream', () => ({
  default: (...args: unknown[]) => mockUseRallyEventStream(...args),
}));

vi.mock('@/client', () => ({
  getCheckpoints: vi.fn(),
  getCheckpointsCount: vi.fn(),
  getTeamById: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTeamProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTeamAuth.mockReturnValue({
      isAuthenticated: true,
      teamData: { team_id: 1 },
      isLoading: false,
    });
    mockUseRallySettings.mockReturnValue({
      settings: { participant_view_enabled: true, show_score_mode: 'individual' },
      isLoading: false,
    });
    vi.mocked(getTeamById).mockResolvedValue({
      data: {
        id: 1,
        name: 'Team A',
        total: 20,
        last_checkpoint_number: 1,
        times: ['t1'],
        current_checkpoint_number: 2,
      },
    } as never);
    vi.mocked(getCheckpoints).mockResolvedValue({
      data: [
        { id: 1, order: 1 },
        { id: 2, order: 2 },
      ],
    } as never);
    vi.mocked(getCheckpointsCount).mockResolvedValue({ data: 2 } as never);
  });

  it('loads team, checkpoints, and computes derived progress values', async () => {
    const { result } = renderHook(() => useTeamProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.team?.name).toBe('Team A');
    expect(result.current.completedCheckpointsCount).toBe(1);
    expect(result.current.nextCheckpoint?.order).toBe(2);
    expect(result.current.showScore).toBe(true);
    expect(result.current.showRanking).toBe(false);
    expect(result.current.totalCount).toBe(2);
  });

  it('redirects to /team-login when not authenticated', async () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false, teamData: null, isLoading: false });
    renderHook(() => useTeamProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/team-login' }));
  });

  it('redirects to /scoreboard when participant view is disabled', async () => {
    mockUseRallySettings.mockReturnValue({
      settings: { participant_view_enabled: false },
      isLoading: false,
    });
    renderHook(() => useTeamProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/scoreboard' }));
  });

  it('toggles checkpoint expansion state', async () => {
    const { result } = renderHook(() => useTeamProgress(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.expandedCheckpoints.has(0)).toBe(false);
    act(() => result.current.toggleCheckpoint(0));
    expect(result.current.expandedCheckpoints.has(0)).toBe(true);
    act(() => result.current.toggleCheckpoint(0));
    expect(result.current.expandedCheckpoints.has(0)).toBe(false);
  });

  it('tolerates checkpoints-count fetch failure by falling back to null', async () => {
    vi.mocked(getCheckpointsCount).mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useTeamProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Falls back to checkpoints.length when count fetch fails.
    await waitFor(() => expect(result.current.totalCount).toBe(2));
  });

  it('uses times.length as completed count fallback when last_checkpoint_number is absent', async () => {
    vi.mocked(getTeamById).mockResolvedValue({
      data: { id: 1, name: 'Team A', total: 0, times: ['t1', 't2'] },
    } as never);
    const { result } = renderHook(() => useTeamProgress(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.completedCheckpointsCount).toBe(2);
  });
});
