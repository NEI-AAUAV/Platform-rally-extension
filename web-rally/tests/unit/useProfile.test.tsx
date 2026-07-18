import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({ sub: undefined as string | undefined }))

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) => selector({ sub: h.sub }),
}))

vi.mock('@/services/ProfileService', () => ({
  ProfileService: { getMyProfile: vi.fn() },
}))

import { useProfile } from '@/hooks/useProfile'
import { ProfileService } from '@/services/ProfileService'

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.sub = undefined
  })

  it('is disabled when there is no authenticated sub', () => {
    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(ProfileService.getMyProfile).not.toHaveBeenCalled()
  })

  it('fetches the profile when a sub is present', async () => {
    h.sub = 'uuid-1'
    vi.mocked(ProfileService.getMyProfile).mockResolvedValueOnce({ sub: 'uuid-1' } as never)

    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ sub: 'uuid-1' })
  })
})
