/**
 * Test suite for activities hooks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useActivities, useCreateActivity, useUpdateActivity, useDeleteActivity } from '@/hooks/useActivities'
import { ActivitiesService, ActivityType } from '@/client'

// Mock ActivitiesService
vi.mock('@/client', () => ({
  ActivitiesService: {
    getActivitiesApiRallyV1ActivitiesGet: vi.fn(),
    createActivityApiRallyV1ActivitiesPost: vi.fn(),
    updateActivityApiRallyV1ActivitiesActivityIdPut: vi.fn(),
    deleteActivityApiRallyV1ActivitiesActivityIdDelete: vi.fn(),
  }
}))

// Mock useUser hook - make it dynamic
const mockUseUser = vi.fn(() => ({
  userStore: {
    scopes: ['manager-rally'],
    token: 'test-token',
  },
}))

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
    })
  })

  it('should fetch activities when user is manager', async () => {
    const mockActivities = [
      { id: 1, name: 'Activity 1', activity_type: 'GeneralActivity' },
      { id: 2, name: 'Activity 2', activity_type: 'TimeBasedActivity' },
    ]

    vi.mocked(ActivitiesService.getActivitiesApiRallyV1ActivitiesGet).mockResolvedValue(mockActivities as any)

    const { result } = renderHook(() => useActivities(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockActivities)
    expect(ActivitiesService.getActivitiesApiRallyV1ActivitiesGet).toHaveBeenCalledTimes(1)
  })

  it('should not fetch activities when user is not manager', async () => {
    mockUseUser.mockReturnValue({
      userStore: {
        scopes: ['rally-staff'],
        token: 'test-token',
      },
    })

    const { result } = renderHook(() => useActivities(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false)
    }, { timeout: 2000 })

    expect(ActivitiesService.getActivitiesApiRallyV1ActivitiesGet).not.toHaveBeenCalled()
  })

  it('should not fetch activities when token is missing', async () => {
    mockUseUser.mockReturnValue({
      userStore: {
        scopes: ['manager-rally'],
        token: '',
      },
    })

    const { result } = renderHook(() => useActivities(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false)
    }, { timeout: 2000 })

    expect(ActivitiesService.getActivitiesApiRallyV1ActivitiesGet).not.toHaveBeenCalled()
  })
})

describe('useCreateActivity Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create activity and invalidate queries', async () => {
    const mockActivity = {
      name: 'New Activity',
      activity_type: ActivityType.GENERAL_ACTIVITY,
      checkpoint_id: 1,
    }

    const mockCreatedActivity = { id: 1, ...mockActivity }

    vi.mocked(ActivitiesService.createActivityApiRallyV1ActivitiesPost).mockResolvedValue(mockCreatedActivity as any)

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

    expect(ActivitiesService.createActivityApiRallyV1ActivitiesPost).toHaveBeenCalledWith(mockActivity)
    
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

    vi.mocked(ActivitiesService.updateActivityApiRallyV1ActivitiesActivityIdPut).mockResolvedValue(mockUpdatedActivity as any)

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

    expect(ActivitiesService.updateActivityApiRallyV1ActivitiesActivityIdPut).toHaveBeenCalledWith(1, mockUpdate.activity)
    
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
    vi.mocked(ActivitiesService.deleteActivityApiRallyV1ActivitiesActivityIdDelete).mockResolvedValue(undefined as any)

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

    expect(ActivitiesService.deleteActivityApiRallyV1ActivitiesActivityIdDelete).toHaveBeenCalledWith(1)
    
    // Wait for invalidation to complete
    await waitFor(() => {
      const state = queryClient.getQueryState(['activities'])
      expect(state?.isInvalidated).toBe(true)
    })
  })
})

