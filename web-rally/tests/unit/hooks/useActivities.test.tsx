/**
 * Test suite for activities hooks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity } from '@/hooks/useActivities'
import { getActivities, createActivity, updateActivity, deleteActivity } from '@/client'
import type { ActivityType } from '@/client'

// Mock the flat client functions used by useActivities
vi.mock('@/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/client')>()
  return {
    ...actual,
    getActivities: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    deleteActivity: vi.fn(),
  }
})

// Mock useUser hook - make it dynamic
const mockUseUser = vi.fn(() => {
  const scopes = ['manager-rally'];
  const token = 'test-token';

  return {
    userStore: {
      scopes,
      token,
    },
    isRallyAdmin: scopes.includes('manager-rally') || scopes.includes('admin'),
    isLoading: false,
  }
})

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
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
      mutations: {
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

describe('useActivities Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUser.mockReturnValue({
      userStore: {
        scopes: ['manager-rally'],
        token: 'test-token',
      },
      isRallyAdmin: true,
      isLoading: false,
    } as never)
  })

  it('should fetch activities when user is manager', async () => {
    const mockActivities = [
      { id: 1, name: 'Activity 1', activity_type: 'GeneralActivity' },
      { id: 2, name: 'Activity 2', activity_type: 'TimeBasedActivity' },
    ]

    vi.mocked(getActivities).mockResolvedValue({ data: mockActivities } as never)

    const { result } = renderHook(() => useActivities(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockActivities)
    expect(getActivities).toHaveBeenCalledTimes(1)
  })

  it('should not fetch activities when user is not manager', async () => {
    mockUseUser.mockReturnValue({
      userStore: {
        scopes: ['rally-staff'],
        token: 'test-token',
      },
      isRallyAdmin: false,
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useActivities(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false)
    }, { timeout: 2000 })

    expect(getActivities).not.toHaveBeenCalled()
  })

  it('should not fetch activities when token is missing', async () => {
    mockUseUser.mockReturnValue({
      userStore: {
        scopes: ['manager-rally'],
        token: '',
      },
      isRallyAdmin: true,
    } as never)

    const { result } = renderHook(() => useActivities(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false)
    }, { timeout: 2000 })

    expect(getActivities).not.toHaveBeenCalled()
  })
})

describe('useCreateActivity Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create activity and invalidate queries', async () => {
    const mockActivity = {
      name: 'New Activity',
      activity_type: 'GeneralActivity' as ActivityType,
      checkpoint_id: 1,
    }

    const mockCreatedActivity = { id: 1, ...mockActivity }

    vi.mocked(createActivity).mockResolvedValue({ data: mockCreatedActivity } as never)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    // Set up a query state first
    queryClient.setQueryData(['activities'], [])

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )

    const { result } = renderHook(() => useCreateActivity(), {
      wrapper,
    })

    await result.current.mutateAsync(mockActivity)

    expect(createActivity).toHaveBeenCalledWith({ body: mockActivity })

    // Wait for invalidation to complete
    await waitFor(() => {
      const state = queryClient.getQueryState(['activities'])
      expect(state?.isInvalidated).toBe(true)
    })
  })
})

describe('useUpdateActivity Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update activity and invalidate queries', async () => {
    const mockUpdate = {
      id: 1,
      activity: { name: 'Updated Activity' },
    }

    const mockUpdatedActivity = { id: 1, name: 'Updated Activity' }

    vi.mocked(updateActivity).mockResolvedValue({ data: mockUpdatedActivity } as never)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    // Set up a query state first
    queryClient.setQueryData(['activities'], [])

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )

    const { result } = renderHook(() => useUpdateActivity(), {
      wrapper,
    })

    await result.current.mutateAsync(mockUpdate)

    expect(updateActivity).toHaveBeenCalledWith({
      path: { activity_id: 1 },
      body: mockUpdate.activity,
    })

    // Wait for invalidation to complete
    await waitFor(() => {
      const state = queryClient.getQueryState(['activities'])
      expect(state?.isInvalidated).toBe(true)
    })
  })
})

describe('useDeleteActivity Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete activity and invalidate queries', async () => {
    vi.mocked(deleteActivity).mockResolvedValue({ data: undefined } as never)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    // Set up a query state first
    queryClient.setQueryData(['activities'], [])

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )

    const { result } = renderHook(() => useDeleteActivity(), {
      wrapper,
    })

    await result.current.mutateAsync(1)

    expect(deleteActivity).toHaveBeenCalledWith({ path: { activity_id: 1 } })

    // Wait for invalidation to complete
    await waitFor(() => {
      const state = queryClient.getQueryState(['activities'])
      expect(state?.isInvalidated).toBe(true)
    })
  })
})

