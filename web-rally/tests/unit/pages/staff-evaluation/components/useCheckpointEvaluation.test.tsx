import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCheckpointEvaluation } from '@/pages/staff-evaluation/components/useCheckpointEvaluation';
import { ApiError } from '@/services/apiClient';

const {
  mockGetCheckpoints,
  mockGetTeams,
  mockGetActivities,
  mockGetAllActivityResults,
  mockGetTeamActivitiesForEvaluation,
  mockEvaluateTeamActivity,
  mockUseUserStore,
  mockUseUser,
  mockUseAppToast,
  mockEnqueue,
} = vi.hoisted(() => ({
  mockGetCheckpoints: vi.fn(),
  mockGetTeams: vi.fn(),
  mockGetActivities: vi.fn(),
  mockGetAllActivityResults: vi.fn(),
  mockGetTeamActivitiesForEvaluation: vi.fn(),
  mockEvaluateTeamActivity: vi.fn(),
  mockUseUserStore: vi.fn(),
  mockUseUser: vi.fn(),
  mockUseAppToast: vi.fn(),
  mockEnqueue: vi.fn(),
}));

vi.mock('@/client', () => ({
  getCheckpoints: mockGetCheckpoints,
  getTeams: mockGetTeams,
  getActivities: mockGetActivities,
  getAllActivityResults: mockGetAllActivityResults,
  getTeamActivitiesForEvaluation: mockGetTeamActivitiesForEvaluation,
  evaluateTeamActivity: mockEvaluateTeamActivity,
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: () => mockUseUserStore(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockUseAppToast(),
}));

vi.mock('@/offline/evalQueue', () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const checkpoint = { id: 1, name: 'CP1', order: 2 };
const teams = [{ id: 1, name: 'Team A', last_checkpoint_number: 1 }] as any[];

describe('useCheckpointEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserStore.mockReturnValue({ token: 'tok' });
    mockUseUser.mockReturnValue({ isRallyAdmin: false });
    mockUseAppToast.mockReturnValue({ success: vi.fn(), error: vi.fn() });
    mockGetCheckpoints.mockResolvedValue({ data: [checkpoint] });
    mockGetTeams.mockResolvedValue({ data: teams });
    mockGetActivities.mockResolvedValue({ data: { activities: [] } });
    mockGetAllActivityResults.mockResolvedValue({ data: [] });
  });

  it('loads checkpoint and teams', async () => {
    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));
    await waitFor(() => expect(result.current.checkpointTeams).toEqual(teams));
  });

  it('selectTeam and backToTeams toggle state', async () => {
    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));

    act(() => result.current.selectTeam(teams[0]!));
    expect(result.current.selectedTeam).toEqual(teams[0]);
    expect(result.current.showTeamList).toBe(false);

    act(() => result.current.backToTeams());
    expect(result.current.selectedTeam).toBeNull();
    expect(result.current.showTeamList).toBe(true);
  });

  it('dismissWarning resets dialog state', async () => {
    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));
    act(() => result.current.dismissWarning());
    expect(result.current.showWarningDialog).toBe(false);
    expect(result.current.evaluationSummary).toBeNull();
  });

  it('handles successful evaluation submit', async () => {
    mockEvaluateTeamActivity.mockResolvedValue({ data: { id: 1 } });
    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));

    await act(async () => {
      await result.current.handleEvaluateActivity(1, 1, { result_data: {}, extra_shots: 0, penalties: {} });
    });
    expect(mockEvaluateTeamActivity).toHaveBeenCalled();
  });

  it('queues evaluation offline on network error', async () => {
    mockEvaluateTeamActivity.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));

    await act(async () => {
      await result.current.handleEvaluateActivity(1, 1, { result_data: {}, extra_shots: 0, penalties: {} });
    });
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it('surfaces ApiError validation details on submit failure', async () => {
    const apiError = new ApiError(422, { detail: 'invalid' });
    mockEvaluateTeamActivity.mockRejectedValue(apiError);
    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));

    await act(async () => {
      await result.current.handleEvaluateActivity(1, 1, { result_data: {}, extra_shots: 0, penalties: {} });
    });
    expect(mockEvaluateTeamActivity).toHaveBeenCalled();
  });

  it('rethrows a non-ApiError, non-network error via onError toast', async () => {
    const mockToastError = vi.fn();
    mockUseAppToast.mockReturnValue({ success: vi.fn(), error: mockToastError });
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    mockEvaluateTeamActivity.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));

    await act(async () => {
      await result.current.handleEvaluateActivity(1, 1, { result_data: {}, extra_shots: 0, penalties: {} });
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('returns staff activities directly when staff endpoint succeeds and checkpoint matches', async () => {
    mockUseUser.mockReturnValue({ isRallyAdmin: false });
    mockGetTeamActivitiesForEvaluation.mockResolvedValue({
      data: {
        activities: [{ id: 10, evaluation_status: 'pending' }],
        evaluation_summary: null,
      },
    });
    const matchingTeam = { id: 1, name: 'Team A', last_checkpoint_number: 1 } as any;
    mockGetTeams.mockResolvedValue({ data: [matchingTeam] });

    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));

    act(() => result.current.selectTeam(matchingTeam));

    await waitFor(() => expect(result.current.teamActivities).toEqual([
      { id: 10, evaluation_status: 'pending' },
    ]));
    expect(mockGetTeamActivitiesForEvaluation).toHaveBeenCalled();
  });

  it('shows warning dialog when rally admin evaluates a team from a different checkpoint', async () => {
    mockUseUser.mockReturnValue({ isRallyAdmin: true });
    const mismatchedTeam = { id: 2, name: 'Team B', last_checkpoint_number: 0 } as any;
    mockGetTeams.mockResolvedValue({ data: [mismatchedTeam] });
    mockGetActivities.mockResolvedValue({ data: { activities: [] } });

    const { result } = renderHook(() => useCheckpointEvaluation('1'), { wrapper });
    await waitFor(() => expect(result.current.checkpoint).toEqual(checkpoint));

    act(() => result.current.selectTeam(mismatchedTeam));

    await waitFor(() => expect(result.current.showWarningDialog).toBe(true));
    expect(result.current.evaluationSummary).toMatchObject({
      checkpoint_mismatch: true,
      team_checkpoint: 0,
      current_checkpoint: 2,
    });
  });
});
