import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCheckpointManagement } from '@/pages/admin/components/checkpoints/useCheckpointManagement';
import type { UserState } from '@/stores/useUserStore';

const {
  mockGetRouteStatus,
  mockCreateCheckpoint,
  mockUpdateCheckpoint,
  mockDeleteCheckpoint,
  mockReorderCheckpoints,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockGetRouteStatus: vi.fn(),
  mockCreateCheckpoint: vi.fn(),
  mockUpdateCheckpoint: vi.fn(),
  mockDeleteCheckpoint: vi.fn(),
  mockReorderCheckpoints: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/client', () => ({
  getRouteStatus: (...args: unknown[]) => mockGetRouteStatus(...args),
  createCheckpoint: (...args: unknown[]) => mockCreateCheckpoint(...args),
  updateCheckpoint: (...args: unknown[]) => mockUpdateCheckpoint(...args),
  deleteCheckpoint: (...args: unknown[]) => mockDeleteCheckpoint(...args),
  reorderCheckpoints: (...args: unknown[]) => mockReorderCheckpoints(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const userStore = { token: 'test-token' } as UserState;

// The hook reads the planning view, which wraps the posts in a route summary.
const routeStatus = (checkpoints: unknown[] = []) => ({
  data: {
    published_count: checkpoints.length,
    draft_count: 0,
    incomplete_published_ids: [],
    checkpoints,
  },
});

const checkpoint = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'CP One',
  description: 'desc',
  latitude: 1.1,
  longitude: 2.2,
  arrival_radius_m: 50,
  order: 1,
  ...overrides,
});

describe('useCheckpointManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRouteStatus.mockResolvedValue(routeStatus());
    mockCreateCheckpoint.mockResolvedValue({ data: checkpoint() });
    mockUpdateCheckpoint.mockResolvedValue({ data: checkpoint() });
    mockDeleteCheckpoint.mockResolvedValue({ data: null });
    mockReorderCheckpoints.mockResolvedValue({ data: null });
  });

  it('does not fetch checkpoints when token is missing', async () => {
    const { result } = renderHook(() => useCheckpointManagement({ token: '' } as UserState), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(false));
    expect(mockGetRouteStatus).not.toHaveBeenCalled();
  });

  it('fetches and sorts checkpoints by order', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint({ id: 2, order: 2, name: 'CP Two' }), checkpoint({ id: 1, order: 1 })]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));
    expect(result.current.sortedCheckpoints.map((c) => c.id)).toEqual([1, 2]);
  });

  it('computes nextOrder as 1 when there are no checkpoints', async () => {
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.checkpointForm.getValues('order')).toBe(1));
  });

  it('computes nextOrder as max+1 when checkpoints exist', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint({ id: 1, order: 3 })]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.checkpointForm.getValues('order')).toBe(4));
  });

  it('creates a checkpoint and shows success toast', async () => {
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(false));

    await act(async () => {
      result.current.handleCheckpointSubmit({
        name: 'New CP',
        description: '',
        latitude: '',
        longitude: '',
        arrival_radius_m: 50,
        order: 1,
        is_draft: false,
        is_placeholder: false,
      });
    });

    await waitFor(() => expect(mockCreateCheckpoint).toHaveBeenCalled());
    expect(mockCreateCheckpoint).toHaveBeenCalledWith({
      body: {
        name: 'New CP',
        description: '',
        latitude: null,
        longitude: null,
        arrival_radius_m: 50,
        order: 1,
        clue: null,
        clue_media_url: null,
        staff_script: null,
        challenge_brief: null,
        is_draft: false,
        is_placeholder: false,
      },
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Checkpoint criado com sucesso!'));
  });

  it('shows error toast when create fails', async () => {
    mockCreateCheckpoint.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(false));

    await act(async () => {
      result.current.handleCheckpointSubmit({
        name: 'New CP',
        description: '',
        latitude: '',
        longitude: '',
        arrival_radius_m: 50,
        order: 1,
        is_draft: false,
        is_placeholder: false,
      });
    });

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('updates a checkpoint when editing', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint()]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    act(() => {
      result.current.startEditCheckpoint(checkpoint());
    });
    expect(result.current.editingCheckpoint).toEqual(checkpoint());
    expect(result.current.checkpointForm.getValues('name')).toBe('CP One');
    expect(result.current.checkpointForm.getValues('latitude')).toBe('1.1');

    await act(async () => {
      result.current.handleCheckpointSubmit({
        name: 'Updated CP',
        description: 'desc',
        latitude: '1.1',
        longitude: '2.2',
        arrival_radius_m: 50,
        order: 1,
        is_draft: false,
        is_placeholder: false,
      });
    });

    await waitFor(() =>
      expect(mockUpdateCheckpoint).toHaveBeenCalledWith({
        path: { id: 1 },
        body: {
          name: 'Updated CP',
          description: 'desc',
          latitude: 1.1,
          longitude: 2.2,
          arrival_radius_m: 50,
          order: 1,
          clue: null,
          clue_media_url: null,
          staff_script: null,
          challenge_brief: null,
          is_draft: false,
          is_placeholder: false,
        },
      }),
    );
    await waitFor(() => expect(result.current.editingCheckpoint).toBeNull());
    expect(mockToastSuccess).toHaveBeenCalledWith('Checkpoint atualizado com sucesso!');
  });

  it('shows error toast when update fails', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint()]));
    mockUpdateCheckpoint.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    act(() => {
      result.current.startEditCheckpoint(checkpoint());
    });

    await act(async () => {
      result.current.handleCheckpointSubmit({
        name: 'Updated CP',
        description: 'desc',
        latitude: '1.1',
        longitude: '2.2',
        arrival_radius_m: 50,
        order: 1,
        is_draft: false,
        is_placeholder: false,
      });
    });

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('cancels edit and resets order for new checkpoint', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint()]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    act(() => {
      result.current.startEditCheckpoint(checkpoint());
    });
    expect(result.current.editingCheckpoint).not.toBeNull();

    act(() => {
      result.current.cancelEdit();
    });
    expect(result.current.editingCheckpoint).toBeNull();
  });

  it('deletes a checkpoint and shows success toast', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint()]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    await act(async () => {
      result.current.deleteCheckpoint(1);
    });

    await waitFor(() => expect(mockDeleteCheckpoint).toHaveBeenCalledWith({ path: { id: 1 } }));
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Checkpoint deletado com sucesso!'),
    );
  });

  it('shows error toast when delete fails', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint()]));
    mockDeleteCheckpoint.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    await act(async () => {
      result.current.deleteCheckpoint(1);
    });

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('handles drag start, over and end', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint({ id: 1, order: 1 }), checkpoint({ id: 2, order: 2 })]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    const dragEvent = {
      dataTransfer: { effectAllowed: '', dropEffect: '' },
      preventDefault: vi.fn(),
    } as unknown as React.DragEvent<HTMLElement>;

    act(() => {
      result.current.handleDragStart(dragEvent, result.current.sortedCheckpoints[0]!);
    });
    expect(result.current.draggedCheckpoint).toEqual(result.current.sortedCheckpoints[0]);

    act(() => {
      result.current.handleDragOver(dragEvent);
    });
    expect(dragEvent.preventDefault).toHaveBeenCalled();

    act(() => {
      result.current.handleDragEnd();
    });
    expect(result.current.draggedCheckpoint).toBeNull();
  });

  it('reorders checkpoints on drop between two different checkpoints', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint({ id: 1, order: 1 }), checkpoint({ id: 2, order: 2 })]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    const dragEvent = {
      dataTransfer: { effectAllowed: '', dropEffect: '' },
      preventDefault: vi.fn(),
    } as unknown as React.DragEvent<HTMLElement>;

    const [first, second] = result.current.sortedCheckpoints;

    act(() => {
      result.current.handleDragStart(dragEvent, first!);
    });

    await act(async () => {
      result.current.handleDrop(dragEvent, second!);
    });

    await waitFor(() => expect(mockReorderCheckpoints).toHaveBeenCalled());
    expect(mockReorderCheckpoints).toHaveBeenCalledWith({
      body: { 2: 1, 1: 2 },
    });
    expect(result.current.draggedCheckpoint).toBeNull();
  });

  it('does nothing on drop when dragging onto itself', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint({ id: 1, order: 1 })]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    const dragEvent = {
      dataTransfer: { effectAllowed: '', dropEffect: '' },
      preventDefault: vi.fn(),
    } as unknown as React.DragEvent<HTMLElement>;

    const cp = result.current.sortedCheckpoints[0];

    act(() => {
      result.current.handleDragStart(dragEvent, cp!);
    });

    act(() => {
      result.current.handleDrop(dragEvent, cp!);
    });

    expect(mockReorderCheckpoints).not.toHaveBeenCalled();
    expect(result.current.draggedCheckpoint).toBeNull();
  });

  it('does nothing on drop when there is no dragged checkpoint', async () => {
    mockGetRouteStatus.mockResolvedValue(routeStatus([checkpoint({ id: 1, order: 1 }), checkpoint({ id: 2, order: 2 })]));
    const { result } = renderHook(() => useCheckpointManagement(userStore), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.hasCheckpoints).toBe(true));

    const dragEvent = {
      dataTransfer: { effectAllowed: '', dropEffect: '' },
      preventDefault: vi.fn(),
    } as unknown as React.DragEvent<HTMLElement>;

    act(() => {
      result.current.handleDrop(dragEvent, result.current.sortedCheckpoints[0]!);
    });

    expect(mockReorderCheckpoints).not.toHaveBeenCalled();
  });
});
