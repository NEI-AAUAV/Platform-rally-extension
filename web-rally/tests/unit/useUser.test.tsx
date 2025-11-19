/**
 * Test suite for useUser hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import useUser from '@/hooks/useUser'
import { UserService } from '@/client'
import { useUserStore } from '@/stores/useUserStore'

// Mock UserService
vi.mock('@/client', () => ({
  UserService: {
    getMeApiRallyV1UserMeGet: vi.fn(),
  }
}))

// Mock useUserStore
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: vi.fn(),
}))

// Test wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useUser Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch user data', async () => {
    const mockUser = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
    }

    vi.mocked(UserService.getMeApiRallyV1UserMeGet).mockResolvedValue(mockUser as any)
    vi.mocked(useUserStore).mockReturnValue({
      scopes: ['rally-staff'],
      token: 'test-token',
      sessionLoading: false,
    } as any)

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.userData).toEqual(mockUser)
    expect(UserService.getMeApiRallyV1UserMeGet).toHaveBeenCalledTimes(1)
  })

  it('should identify rally admin correctly', () => {
    vi.mocked(useUserStore).mockReturnValue({
      scopes: ['manager-rally'],
      token: 'test-token',
      sessionLoading: false,
    } as any)

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isRallyAdmin).toBe(true)
  })

  it('should identify non-admin correctly', () => {
    vi.mocked(useUserStore).mockReturnValue({
      scopes: ['rally-staff'],
      token: 'test-token',
      sessionLoading: false,
    } as any)

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isRallyAdmin).toBe(false)
  })

  it('should identify admin scope correctly', () => {
    vi.mocked(useUserStore).mockReturnValue({
      scopes: ['admin'],
      token: 'test-token',
      sessionLoading: false,
    } as any)

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isRallyAdmin).toBe(true)
  })

  it('should return loading state when session is loading', () => {
    vi.mocked(useUserStore).mockReturnValue({
      scopes: ['rally-staff'],
      token: 'test-token',
      sessionLoading: true,
    } as any)

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
  })
})

