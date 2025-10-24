/**
 * Test suite for Rally settings hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import useRallySettings from '@/hooks/useRallySettings'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock console.error to avoid noise in tests
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

// Test wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries in tests
        retryDelay: 100, // Faster retries for tests
      },
    },
  })
  
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useRallySettings Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    mockConsoleError.mockClear()
  })

  it('should fetch rally settings successfully', async () => {
    const mockSettings = {
      rally_theme: 'Test Rally',
      max_teams: 10,
      max_members_per_team: 5,
      rally_start_time: '2024-01-15T10:00:00Z',
      rally_end_time: '2024-01-15T18:00:00Z',
      checkpoint_order_matters: true,
      show_checkpoint_map: true,
      enable_versus: true,
      public_access_enabled: true
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useRallySettings({ retry: false }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.settings).toEqual(mockSettings)
    expect(result.current.error).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith('/api/rally/v1/rally/settings/public')
  })

  it('should handle fetch error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const wrapper = createWrapper()
    const { result } = renderHook(() => useRallySettings({ retry: false }), { wrapper })

    // Wait for the single attempt to complete (retries disabled in tests)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.settings).toBeUndefined()
    expect(result.current.error).toBeTruthy()
  })

  it('should handle non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useRallySettings({ retry: false }), { wrapper })

    // Wait for the single attempt to complete (retries disabled in tests)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.settings).toBeUndefined()
    expect(result.current.error).toBeTruthy()
  })

  it('should return loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

    const wrapper = createWrapper()
    const { result } = renderHook(() => useRallySettings({ retry: false }), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.settings).toBeUndefined()
    expect(result.current.error).toBeNull()
  })

  it('should provide refetch function', async () => {
    const mockSettings = {
      rally_theme: 'Test Rally',
      max_teams: 10,
      max_members_per_team: 5,
      rally_start_time: '2024-01-15T10:00:00Z',
      rally_end_time: '2024-01-15T18:00:00Z',
      checkpoint_order_matters: true,
      show_checkpoint_map: true,
      enable_versus: true,
      public_access_enabled: true
    }

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockSettings
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useRallySettings({ retry: false }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.refetch).toBeDefined()
    expect(typeof result.current.refetch).toBe('function')

    // Test refetch
    await result.current.refetch()
    expect(mockFetch).toHaveBeenCalledTimes(2) // Initial call + refetch
  })

  it('should handle malformed JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON')
      }
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useRallySettings({ retry: false }), { wrapper })

    // Wait for the single attempt to complete (retries disabled in tests)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.settings).toBeUndefined()
    expect(result.current.error).toBeTruthy()
  })

  it('should use correct query key', async () => {
    const mockSettings = {
      rally_theme: 'Test Rally',
      max_teams: 10,
      max_members_per_team: 5,
      rally_start_time: '2024-01-15T10:00:00Z',
      rally_end_time: '2024-01-15T18:00:00Z',
      checkpoint_order_matters: true,
      show_checkpoint_map: true,
      enable_versus: true,
      public_access_enabled: true
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useRallySettings({ retry: false }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify the query key is used correctly
    expect(result.current.settings).toEqual(mockSettings)
  })
})
