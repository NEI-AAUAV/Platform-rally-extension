/**
 * Test suite for useTeamAuth hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import useTeamAuth from '@/hooks/useTeamAuth'
import { teamLogin, getTeamById, addTeamMember, removeTeamMember } from '@/client'

const TEAM_TOKEN_KEY = 'rally_team_token'
const TEAM_DATA_KEY = 'rally_team_data'

// Mock the generated API client. vi.mock factories are hoisted above imports,
// so the error class they reference must be hoisted too.
const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    body: unknown
    constructor(status: number, body: unknown) {
      super('ApiError')
      this.status = status
      this.body = body
    }
  }
  return { MockApiError }
})

vi.mock('@/client', () => ({
  getTeamById: vi.fn().mockResolvedValue({ data: null }),
  addTeamMember: vi.fn().mockResolvedValue({ data: {} }),
  removeTeamMember: vi.fn().mockResolvedValue({ data: {} }),
  teamLogin: vi.fn(),
  ApiError: MockApiError,
}))

// useTeamAuth imports ApiError from @/services/apiClient, so the instanceof
// check in the hook must see the same class the tests throw.
vi.mock('@/services/apiClient', () => ({
  ApiError: MockApiError,
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useTeamAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('should start unauthenticated when no token in localStorage', async () => {
      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.teamData).toBeNull()
    })

    it('should restore auth state from localStorage on mount', async () => {
      const tokenData = { team_id: 42, team_name: 'Team Alpha' }
      localStorage.setItem(TEAM_TOKEN_KEY, 'existing-token')
      localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(tokenData))

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.teamData).toEqual(tokenData)
    })

    it('should clear invalid localStorage data on mount', async () => {
      localStorage.setItem(TEAM_TOKEN_KEY, 'token')
      localStorage.setItem(TEAM_DATA_KEY, 'invalid-json{{{')

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem(TEAM_TOKEN_KEY)).toBeNull()
      expect(localStorage.getItem(TEAM_DATA_KEY)).toBeNull()
    })
  })

  describe('login', () => {
    it('should login successfully and store token', async () => {
      const mockResponse = {
        access_token: 'new-jwt-token',
        token_type: 'bearer',
        team_id: 1,
        team_name: 'Test Team',
      }

      vi.mocked(teamLogin).mockResolvedValueOnce({ data: mockResponse } as never)

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.login('ABCD-1234')
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.teamData).toEqual({ team_id: 1, team_name: 'Test Team' })
      expect(localStorage.getItem(TEAM_TOKEN_KEY)).toBe('new-jwt-token')
      expect(JSON.parse(localStorage.getItem(TEAM_DATA_KEY)!)).toEqual({
        team_id: 1,
        team_name: 'Test Team',
      })
    })

    it('should throw on invalid access code', async () => {
      vi.mocked(teamLogin).mockRejectedValueOnce(
        new MockApiError(400, { detail: 'Invalid access code' }),
      )

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await expect(
        act(async () => {
          await result.current.login('WRONG-CODE')
        })
      ).rejects.toThrow('Invalid access code')

      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should throw generic error when no detail in response', async () => {
      vi.mocked(teamLogin).mockRejectedValueOnce(new MockApiError(400, {}))

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await expect(
        act(async () => {
          await result.current.login('WRONG-CODE')
        })
      ).rejects.toThrow('Login failed')
    })
  })

  describe('logout', () => {
    it('should clear auth state and localStorage on logout', async () => {
      localStorage.setItem(TEAM_TOKEN_KEY, 'some-token')
      localStorage.setItem(TEAM_DATA_KEY, JSON.stringify({ team_id: 1, team_name: 'Team' }))

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      act(() => {
        result.current.logout()
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.teamData).toBeNull()
      expect(localStorage.getItem(TEAM_TOKEN_KEY)).toBeNull()
      expect(localStorage.getItem(TEAM_DATA_KEY)).toBeNull()
    })
  })

  describe('getToken', () => {
    it('should return null when not logged in', () => {
      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })
      expect(result.current.getToken()).toBeNull()
    })

    it('should return token from localStorage', () => {
      localStorage.setItem(TEAM_TOKEN_KEY, 'my-token')
      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })
      expect(result.current.getToken()).toBe('my-token')
    })
  })

  describe('team query', () => {
    it('fetches team data when authenticated and team_id present', async () => {
      const tokenData = { team_id: 42, team_name: 'Team Alpha' }
      localStorage.setItem(TEAM_TOKEN_KEY, 'existing-token')
      localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(tokenData))
      vi.mocked(getTeamById).mockResolvedValueOnce({
        data: { id: 42, name: 'Team Alpha', members: [] },
      } as never)

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.team).toBeDefined())

      expect(getTeamById).toHaveBeenCalledWith({ path: { id: 42 } })
      expect(result.current.team).toEqual({ id: 42, name: 'Team Alpha', members: [] })
    })

    it('does not fetch team data when not authenticated', async () => {
      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(getTeamById).not.toHaveBeenCalled()
    })
  })

  describe('addMember', () => {
    it('throws when no team_id is present', async () => {
      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })
      const capturedError: { current: unknown } = { current: null }

      await act(async () => {
        await new Promise<void>((resolve) => {
          result.current.addMember(
            { name: 'New Member' },
            {
              onError: (err) => {
                capturedError.current = err
                resolve()
              },
              onSuccess: () => resolve(),
            },
          )
        })
      })

      expect((capturedError.current as Error)?.message).toBe('Team ID not found')
    })

    it('adds a member and invalidates team query when authenticated', async () => {
      const tokenData = { team_id: 7, team_name: 'Team Beta' }
      localStorage.setItem(TEAM_TOKEN_KEY, 'existing-token')
      localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(tokenData))
      vi.mocked(getTeamById).mockResolvedValue({
        data: { id: 7, name: 'Team Beta', members: [] },
      } as never)
      vi.mocked(addTeamMember).mockResolvedValueOnce({ data: {} } as never)

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      await act(async () => {
        await new Promise<void>((resolve) => {
          result.current.addMember(
            { name: 'New Member', email: 'a@b.com' },
            { onSuccess: () => resolve() },
          )
        })
      })

      expect(addTeamMember).toHaveBeenCalledWith({
        path: { team_id: 7 },
        body: { name: 'New Member', email: 'a@b.com' },
      })
    })
  })

  describe('removeMember', () => {
    it('throws when no team_id is present', async () => {
      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })
      const capturedError: { current: unknown } = { current: null }

      await act(async () => {
        await new Promise<void>((resolve) => {
          result.current.removeMember(1, {
            onError: (err) => {
              capturedError.current = err
              resolve()
            },
            onSuccess: () => resolve(),
          })
        })
      })

      expect((capturedError.current as Error)?.message).toBe('Team ID not found')
    })

    it('removes a member and invalidates team query when authenticated', async () => {
      const tokenData = { team_id: 9, team_name: 'Team Gamma' }
      localStorage.setItem(TEAM_TOKEN_KEY, 'existing-token')
      localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(tokenData))
      vi.mocked(getTeamById).mockResolvedValue({
        data: { id: 9, name: 'Team Gamma', members: [] },
      } as never)
      vi.mocked(removeTeamMember).mockResolvedValueOnce({ data: {} } as never)

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      await act(async () => {
        await new Promise<void>((resolve) => {
          result.current.removeMember(3, { onSuccess: () => resolve() })
        })
      })

      expect(removeTeamMember).toHaveBeenCalledWith({
        path: { team_id: 9, user_id: 3 },
      })
    })
  })
})
