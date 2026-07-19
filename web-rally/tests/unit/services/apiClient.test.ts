/**
 * Test suite for apiClient.ts — request/error interceptors registered on the
 * generated OpenAPI client, and the ApiError class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requestInterceptors: Array<(request: Request) => Promise<Request> | Request> = []
const errorInterceptors: Array<(error: unknown, response: Response | undefined) => unknown> = []

vi.mock('@/client/client.gen', () => ({
  client: {
    setConfig: vi.fn(),
    interceptors: {
      request: {
        use: (fn: (request: Request) => Promise<Request> | Request) => {
          requestInterceptors.push(fn)
        },
      },
      error: {
        use: (fn: (error: unknown, response: Response | undefined) => unknown) => {
          errorInterceptors.push(fn)
        },
      },
    },
  },
}))

let mockStaffToken: string | null = null
vi.mock('@/stores/useUserStore', () => ({
  useUserStore: {
    getState: () => ({ token: mockStaffToken }),
  },
}))

let mockTeamToken: string | null = null
vi.mock('@/lib/auth/tokenStore', () => ({
  getTeamToken: () => mockTeamToken,
}))

describe('apiClient.ts', () => {
  beforeEach(() => {
    mockStaffToken = null
    mockTeamToken = null
    requestInterceptors.length = 0
    errorInterceptors.length = 0
    vi.resetModules()
  })

  describe('ApiError', () => {
    it('stores status and body, extracting the detail field for the message', async () => {
      const { ApiError } = await import('@/services/apiClient')
      const err = new ApiError(404, { detail: 'not found' })
      expect(err.name).toBe('ApiError')
      expect(err.status).toBe(404)
      expect(err.body).toEqual({ detail: 'not found' })
      expect(err.message).toBe('not found')
    })

    it('stringifies an object body without a string detail field', async () => {
      const { ApiError } = await import('@/services/apiClient')
      const err = new ApiError(422, { errors: ['bad'] })
      expect(err.message).toBe(JSON.stringify({ errors: ['bad'] }))
    })

    it('uses a string body directly as the message', async () => {
      const { ApiError } = await import('@/services/apiClient')
      const err = new ApiError(500, 'server exploded')
      expect(err.message).toBe('server exploded')
    })
  })

  describe('request interceptor', () => {
    it('attaches the staff token when present', async () => {
      mockStaffToken = 'staff-jwt'
      await import('@/services/apiClient')
      const headers = new Headers()
      const request = { headers } as unknown as Request
      await requestInterceptors[0]!(request)
      expect(headers.get('Authorization')).toBe('Bearer staff-jwt')
    })

    it('falls back to the team token when there is no staff token', async () => {
      mockTeamToken = 'team-jwt'
      await import('@/services/apiClient')
      const headers = new Headers()
      const request = { headers } as unknown as Request
      await requestInterceptors[0]!(request)
      expect(headers.get('Authorization')).toBe('Bearer team-jwt')
    })

    it('prefers the staff token over the team token', async () => {
      mockStaffToken = 'staff-jwt'
      mockTeamToken = 'team-jwt'
      await import('@/services/apiClient')
      const headers = new Headers()
      const request = { headers } as unknown as Request
      await requestInterceptors[0]!(request)
      expect(headers.get('Authorization')).toBe('Bearer staff-jwt')
    })

    it('does not set an Authorization header when no token exists', async () => {
      await import('@/services/apiClient')
      const headers = new Headers()
      const request = { headers } as unknown as Request
      await requestInterceptors[0]!(request)
      expect(headers.get('Authorization')).toBeNull()
    })
  })

  describe('error interceptor', () => {
    it('wraps the raw error into an ApiError using the response status', async () => {
      const { ApiError } = await import('@/services/apiClient')
      const response = { status: 403 } as Response
      const result = errorInterceptors[0]!({ detail: 'forbidden' }, response)
      expect(result).toBeInstanceOf(ApiError)
      expect((result as InstanceType<typeof ApiError>).status).toBe(403)
    })

    it('defaults status to 0 when there is no response', async () => {
      const { ApiError } = await import('@/services/apiClient')
      const result = errorInterceptors[0]!({ detail: 'network error' }, undefined)
      expect(result).toBeInstanceOf(ApiError)
      expect((result as InstanceType<typeof ApiError>).status).toBe(0)
    })
  })
})
