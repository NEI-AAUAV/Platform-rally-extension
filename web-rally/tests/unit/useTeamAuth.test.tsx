/**
 * Test suite for useTeamAuth hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import useTeamAuth from '@/hooks/useTeamAuth'

const TEAM_TOKEN_KEY = 'rally_team_token'
const TEAM_DATA_KEY = 'rally_team_data'

// Mock the generated API client
vi.mock('@/client', () => ({
  TeamService: {
    getTeamByIdApiRallyV1TeamIdGet: vi.fn().mockResolvedValue(null),
  },
  TeamMembersService: {
    addTeamMemberApiRallyV1TeamTeamIdMembersPost: vi.fn().mockResolvedValue({}),
    removeTeamMemberApiRallyV1TeamTeamIdMembersUserIdDelete: vi.fn().mockResolvedValue({}),
  },
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

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

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
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Invalid access code' }),
      } as Response)

      const { result } = renderHook(() => useTeamAuth(), { wrapper: createWrapper() })

      await expect(
        act(async () => {
          await result.current.login('WRONG-CODE')
        })
      ).rejects.toThrow('Invalid access code')

      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should throw generic error when no detail in response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      } as Response)

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
})
