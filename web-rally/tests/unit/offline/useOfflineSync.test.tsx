import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  drain: vi.fn(),
  evaluateTeamActivity: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock('@/client', () => ({
  evaluateTeamActivity: h.evaluateTeamActivity,
}))

vi.mock('@/offline/evalQueue', () => ({
  drain: h.drain,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}))

import { useOfflineSync } from '@/offline/useOfflineSync'

describe('useOfflineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.drain.mockResolvedValue(undefined)
    h.invalidateQueries.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  it('drains the queue on mount and invalidates related queries', async () => {
    renderHook(() => useOfflineSync())

    await waitFor(() => expect(h.drain).toHaveBeenCalled())
    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['teamActivities'] })
    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['allEvaluations'] })
    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['checkpointTeams'] })
  })

  it('skips syncing when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    const { result } = renderHook(() => useOfflineSync())

    h.drain.mockClear()
    await act(async () => {
      await result.current.syncNow()
    })
    expect(h.drain).not.toHaveBeenCalled()
  })

  it('drains again when the online event fires', async () => {
    renderHook(() => useOfflineSync())
    await waitFor(() => expect(h.drain).toHaveBeenCalledTimes(1))

    h.drain.mockClear()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(h.drain).toHaveBeenCalledTimes(1))
  })

  it('replays a queued item via evaluateTeamActivity with the original idempotency key', async () => {
    h.drain.mockImplementationOnce(async (replayOne: (item: unknown) => Promise<void>) => {
      await replayOne({
        teamId: 1,
        activityId: 2,
        idempotencyKey: 'key-1',
        resultData: { result_data: { a: 1 }, extra_shots: 2, penalty_counts: { p: 1 } },
      })
    })

    renderHook(() => useOfflineSync())

    await waitFor(() =>
      expect(h.evaluateTeamActivity).toHaveBeenCalledWith({
        path: { team_id: 1, activity_id: 2 },
        body: { result_data: { a: 1 }, extra_shots: 2, penalty_counts: { p: 1 } },
        headers: { 'Idempotency-Key': 'key-1' },
      }),
    )
  })

  it('defaults missing resultData fields when replaying', async () => {
    h.drain.mockImplementationOnce(async (replayOne: (item: unknown) => Promise<void>) => {
      await replayOne({
        teamId: 1,
        activityId: 2,
        idempotencyKey: 'key-2',
        resultData: undefined,
      })
    })

    renderHook(() => useOfflineSync())

    await waitFor(() =>
      expect(h.evaluateTeamActivity).toHaveBeenCalledWith({
        path: { team_id: 1, activity_id: 2 },
        body: { result_data: {}, extra_shots: 0, penalty_counts: {} },
        headers: { 'Idempotency-Key': 'key-2' },
      }),
    )
  })

  it('removes the online listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOfflineSync())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    removeSpy.mockRestore()
  })
})
