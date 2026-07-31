/**
 * Test suite for useAuthSync — bridges react-oidc-context state into the user
 * store and registers the 401 handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { getResumeValue } from '@/lib/authResumeStore'

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
    const { unmount } = renderHook(() => useAuthSync())
    expect(h.setSession).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok-123', user: expect.objectContaining({ sub: 'uuid-1' }) }),
    )
    expect(h.setOnUnauthorized).toHaveBeenCalled()
    unmount()
  })

  it('clears the session when unauthenticated and not loading', () => {
    h.auth.current = { isAuthenticated: false, isLoading: false, user: null }
    const { unmount } = renderHook(() => useAuthSync())
    expect(h.clearSession).toHaveBeenCalled()
    expect(h.setSession).not.toHaveBeenCalled()
    unmount()
  })

  it('does nothing to the store while still loading', () => {
    h.auth.current = { isAuthenticated: false, isLoading: true, user: null }
    const { unmount } = renderHook(() => useAuthSync())
    expect(h.clearSession).not.toHaveBeenCalled()
    expect(h.setSession).not.toHaveBeenCalled()
    unmount()
  })

  it('handles a 401 by clearing queries/session and redirecting to the IdP', async () => {
    const signinRedirect = vi.fn()
    const cancelQueries = vi.fn()
    const clear = vi.fn()
    vi.doMock('@tanstack/react-query', () => ({
      useQueryClient: () => ({ cancelQueries, clear }),
    }))
    vi.resetModules()
    const { useAuthSync: freshUseAuthSync } = await import('@/auth/useAuthSync')

    h.auth.current = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      signinRedirect,
    }
    const { unmount } = renderHook(() => freshUseAuthSync())

    const registeredHandler = h.setOnUnauthorized.mock.calls.at(-1)?.[0] as () => Promise<void>
    expect(registeredHandler).toBeInstanceOf(Function)

    await registeredHandler()

    expect(cancelQueries).toHaveBeenCalled()
    expect(clear).toHaveBeenCalled()
    expect(h.clearSession).toHaveBeenCalled()
    expect(signinRedirect).toHaveBeenCalled()
    expect(getResumeValue('rally_auth_return_url')).toBe(
      globalThis.location.pathname + globalThis.location.search,
    )

    // Calling again while a redirect is already in flight should be a no-op.
    signinRedirect.mockClear()
    await registeredHandler()
    expect(signinRedirect).not.toHaveBeenCalled()

    // Unmounting should clean up the handler.
    unmount()
    expect(h.setOnUnauthorized).toHaveBeenLastCalledWith(null)

    vi.doUnmock('@tanstack/react-query')
  })

  it('resets the 401 guard once the user re-authenticates', async () => {
    const signinRedirect = vi.fn()
    h.auth.current = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      signinRedirect,
    }

    const { rerender, unmount } = renderHook(() => useAuthSync())

    const registeredHandler = h.setOnUnauthorized.mock.calls.at(-1)?.[0] as () => Promise<void>
    expect(registeredHandler).toBeInstanceOf(Function)

    // First 401 call goes through
    await registeredHandler()
    expect(signinRedirect).toHaveBeenCalledTimes(1)

    // Second 401 call is blocked by guard
    await registeredHandler()
    expect(signinRedirect).toHaveBeenCalledTimes(1)

    // Re-authenticate (user logins in)
    h.auth.current = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        expired: false,
        access_token: 'tok-456',
        profile: { sub: 'uuid-2', name: 'Bob', email: 'b@x.pt', groups: [] },
      },
      signinRedirect,
    }
    rerender()

    // After re-authentication, the guard should be reset, so next 401 call goes through again
    // First, make user unauthenticated again
    h.auth.current = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      signinRedirect,
    }
    rerender()

    await registeredHandler()
    expect(signinRedirect).toHaveBeenCalledTimes(2)

    unmount()
  })
})
