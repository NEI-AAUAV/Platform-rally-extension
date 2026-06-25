/**
 * Test suite for client.ts — axios client factory, team-token refresh, and the
 * unauthorized handler hook. Staff auth is owned by react-oidc-context, so only
 * team tokens are refreshed here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  return {
    default: {
      ...actual.default,
      create: vi.fn(),
      request: vi.fn(),
    },
  }
})

const mockStoreState = {
  token: null as string | null,
}

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: {
    getState: () => mockStoreState,
  },
}))

vi.mock('@/config', () => ({
  default: {
    BASE_URL: 'http://localhost:8000',
  },
}))

describe('client.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockStoreState.token = null
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('createClient', () => {
    it('creates an axios instance with the given baseURL', async () => {
      const mockInstance = {
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      }
      vi.mocked(axios.create).mockReturnValue(mockInstance as never)

      const { createClient } = await import('@/services/client')
      const client = createClient('http://localhost:8000')

      expect(axios.create).toHaveBeenCalledWith({ baseURL: 'http://localhost:8000', timeout: 5000 })
      expect(client).toBe(mockInstance)
    })
  })

  describe('refreshTeamToken', () => {
    it('refreshes via the team-auth endpoint when a team token exists', async () => {
      localStorage.setItem('rally_team_token', 'team-jwt')

      const mockPost = vi.fn().mockResolvedValue({ data: { access_token: 'new-team-token' } })
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as never)

      const { refreshTeamToken } = await import('@/services/client')
      const result = await refreshTeamToken()

      expect(result).toBe('new-team-token')
      expect(mockPost).toHaveBeenCalledWith('/api/rally/v1/team-auth/refresh')
      expect(localStorage.getItem('rally_team_token')).toBe('new-team-token')
    })

    it('clears team tokens when the refresh fails', async () => {
      localStorage.setItem('rally_team_token', 'expired-team-jwt')
      localStorage.setItem('rally_team_data', '{"team_id":1}')

      const mockPost = vi.fn().mockRejectedValue(new Error('Unauthorized'))
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as never)

      const { refreshTeamToken } = await import('@/services/client')
      const result = await refreshTeamToken()

      expect(result).toBeUndefined()
      expect(localStorage.getItem('rally_team_token')).toBeNull()
      expect(localStorage.getItem('rally_team_data')).toBeNull()
    })

    it('returns undefined when there is no team token', async () => {
      const { refreshTeamToken } = await import('@/services/client')
      const result = await refreshTeamToken()
      expect(result).toBeUndefined()
    })
  })

  describe('setOnUnauthorized', () => {
    it('registers a handler without throwing', async () => {
      const { setOnUnauthorized } = await import('@/services/client')
      expect(() => setOnUnauthorized(vi.fn())).not.toThrow()
      expect(() => setOnUnauthorized(null)).not.toThrow()
    })
  })
})
