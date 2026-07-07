/**
 * Test suite for useUser hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import useUser from '@/hooks/useUser'
import { getMe } from '@/client'


// Mock the flat client function used by useUser
vi.mock('@/client', () => ({
  getMe: vi.fn(),
}))

// Mock useUserStore
const mockUserStoreState = {
  scopes: [],
  token: null,
  sessionLoading: false,
};

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: vi.fn((selector) => selector ? selector(mockUserStoreState) : mockUserStoreState),
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

    vi.mocked(getMe).mockResolvedValue({ data: mockUser } as never)
    Object.assign(mockUserStoreState, {
      scopes: ['rally-staff'],
      token: 'test-token',
      sessionLoading: false,
    })

    const { result } = renderHook(() => useUser({ fetchUserData: true }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.userData).toEqual(mockUser)
    expect(getMe).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'rally admin correctly', scopes: ['manager-rally'], expected: true },
    { name: 'non-admin correctly', scopes: ['rally-staff'], expected: false },
    { name: 'admin scope correctly', scopes: ['admin'], expected: true },
  ])('should identify $name', ({ scopes, expected }) => {
    Object.assign(mockUserStoreState, {
      scopes,
      token: 'test-token',
      sessionLoading: false,
    })

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isRallyAdmin).toBe(expected)
  })

  it('should return loading state when session is loading', () => {
    Object.assign(mockUserStoreState, {
      scopes: ['rally-staff'],
      token: 'test-token',
      sessionLoading: true,
    })

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
  })
})

