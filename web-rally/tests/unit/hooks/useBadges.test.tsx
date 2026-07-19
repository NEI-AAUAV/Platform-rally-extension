import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAllBadges, useTeamBadges, useBadgeShowcase } from '@/hooks/useBadges'
import { BadgeService } from '@/services/BadgeService'
import { teamBadgeShowcase } from '@/client'

vi.mock('@/services/BadgeService', () => ({
  BadgeService: {
    listAllBadges: vi.fn(),
    listTeamBadges: vi.fn(),
  },
}))

vi.mock('@/client', () => ({
  teamBadgeShowcase: vi.fn(),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useBadges hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useAllBadges fetches all badges', async () => {
    vi.mocked(BadgeService.listAllBadges).mockResolvedValueOnce([{ id: 1 } as never])
    const { result } = renderHook(() => useAllBadges(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: 1 }])
  })

  it('useTeamBadges is disabled when teamId is undefined', () => {
    const { result } = renderHook(() => useTeamBadges(undefined), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(BadgeService.listTeamBadges).not.toHaveBeenCalled()
  })

  it('useTeamBadges fetches when teamId is a valid number', async () => {
    vi.mocked(BadgeService.listTeamBadges).mockResolvedValueOnce([{ id: 2 } as never])
    const { result } = renderHook(() => useTeamBadges(5), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(BadgeService.listTeamBadges).toHaveBeenCalledWith(5)
  })

  it('useTeamBadges is disabled when teamId is NaN', () => {
    const { result } = renderHook(() => useTeamBadges(Number.NaN), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('useBadgeShowcase is disabled when teamId is undefined', () => {
    const { result } = renderHook(() => useBadgeShowcase(undefined), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(teamBadgeShowcase).not.toHaveBeenCalled()
  })

  it('useBadgeShowcase fetches the showcase for a valid teamId', async () => {
    vi.mocked(teamBadgeShowcase).mockResolvedValueOnce({ data: { earned: [] } } as never)
    const { result } = renderHook(() => useBadgeShowcase(7), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(teamBadgeShowcase).toHaveBeenCalledWith({ path: { team_id: 7 } })
    expect(result.current.data).toEqual({ earned: [] })
  })
})
