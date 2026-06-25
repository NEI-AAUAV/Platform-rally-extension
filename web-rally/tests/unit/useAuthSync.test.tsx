/**
 * Test suite for useAuthSync — bridges react-oidc-context state into the user
 * store and registers the 401 handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({
  setSession: vi.fn(),
  clearSession: vi.fn(),
  setOnUnauthorized: vi.fn(),
  auth: { current: {} as Record<string, unknown> },
}))

vi.mock('react-oidc-context', () => ({
  useAuth: () => h.auth.current,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ cancelQueries: vi.fn(), clear: vi.fn() }),
}))

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) =>
    selector({ setSession: h.setSession, clearSession: h.clearSession }),
}))

vi.mock('@/services/client', () => ({
  setOnUnauthorized: h.setOnUnauthorized,
}))

import { useAuthSync } from '@/auth/useAuthSync'

describe('useAuthSync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pushes the access token + identity into the store when authenticated', () => {
    h.auth.current = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        expired: false,
        access_token: 'tok-123',
        profile: { sub: 'uuid-1', name: 'Jane', email: 'j@x.pt', groups: ['admin'] },
      },
    }
    renderHook(() => useAuthSync())
    expect(h.setSession).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok-123', user: expect.objectContaining({ sub: 'uuid-1' }) }),
    )
    expect(h.setOnUnauthorized).toHaveBeenCalled()
  })

  it('clears the session when unauthenticated and not loading', () => {
    h.auth.current = { isAuthenticated: false, isLoading: false, user: null }
    renderHook(() => useAuthSync())
    expect(h.clearSession).toHaveBeenCalled()
    expect(h.setSession).not.toHaveBeenCalled()
  })

  it('does nothing to the store while still loading', () => {
    h.auth.current = { isAuthenticated: false, isLoading: true, user: null }
    renderHook(() => useAuthSync())
    expect(h.clearSession).not.toHaveBeenCalled()
    expect(h.setSession).not.toHaveBeenCalled()
  })
})
