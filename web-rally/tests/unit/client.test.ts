/**
 * Test suite for client.ts — axios client factory and token refresh logic
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'

// Mock axios
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

// Mock useUserStore
const mockStoreState = {
  token: null as string | null,
  login: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: {
    getState: () => mockStoreState,
  },
}))

// Mock config
vi.mock('@/config', () => ({
  default: {
    BASE_URL: 'http://localhost:8000',
    API_NEI_URL: 'http://localhost:8001',
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
    it('should create an axios instance', async () => {
      const mockInstance = {
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      }
      vi.mocked(axios.create).mockReturnValue(mockInstance as any)

      const { createClient } = await import('@/services/client')
      const client = createClient('http://localhost:8000')

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8000',
        timeout: 5000,
      })
      expect(client).toBe(mockInstance)
    })

    it('should create client without baseURL', async () => {
      const mockInstance = {
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      }
      vi.mocked(axios.create).mockReturnValue(mockInstance as any)

      const { createClient } = await import('@/services/client')
      createClient()

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: undefined,
        timeout: 5000,
      })
    })
  })

  describe('refreshToken', () => {
    it('should use team refresh endpoint when team token exists and no staff token', async () => {
      localStorage.setItem('rally_team_token', 'team-jwt')
      mockStoreState.token = null

      const mockPost = vi.fn().mockResolvedValue({ data: { access_token: 'new-team-token' } })
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any)

      const { refreshToken } = await import('@/services/client')
      const result = await refreshToken()

      expect(result).toBe('new-team-token')
      expect(localStorage.getItem('rally_team_token')).toBe('new-team-token')
    })

    it('should clear team tokens when team refresh fails', async () => {
      localStorage.setItem('rally_team_token', 'expired-team-jwt')
      localStorage.setItem('rally_team_data', '{"team_id":1}')
      mockStoreState.token = null

      const mockPost = vi.fn().mockRejectedValue(new Error('Unauthorized'))
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any)

      const { refreshToken } = await import('@/services/client')
      const result = await refreshToken()

      expect(result).toBeUndefined()
      expect(localStorage.getItem('rally_team_token')).toBeNull()
      expect(localStorage.getItem('rally_team_data')).toBeNull()
    })

    it('should use NEI refresh endpoint when staff token exists', async () => {
      mockStoreState.token = 'staff-jwt'

      const mockPost = vi.fn().mockResolvedValue({ data: { access_token: 'new-staff-token' } })
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any)

      const { refreshToken } = await import('@/services/client')
      const result = await refreshToken()

      expect(result).toBe('new-staff-token')
      expect(mockStoreState.login).toHaveBeenCalledWith({ token: 'new-staff-token' })
    })

    it('should logout staff user when NEI refresh fails', async () => {
      mockStoreState.token = 'expired-staff-jwt'

      const mockPost = vi.fn().mockRejectedValue(new Error('Unauthorized'))
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any)

      const { refreshToken } = await import('@/services/client')
      const result = await refreshToken()

      expect(result).toBeUndefined()
      expect(mockStoreState.logout).toHaveBeenCalled()
    })

    it('should use NEI endpoint when no token exists at all', async () => {
      mockStoreState.token = null

      const mockPost = vi.fn().mockResolvedValue({ data: { access_token: 'new-token' } })
      vi.mocked(axios.create).mockReturnValue({ post: mockPost } as any)

      const { refreshToken } = await import('@/services/client')
      await refreshToken()

      // Should call NEI endpoint (not team endpoint)
      expect(mockPost).toHaveBeenCalledWith('/auth/refresh/')
    })
  })
})
