/**
 * M10 regression: logout must clear the local rally session AND end the
 * OIDC session (removeUser + signoutRedirect), not just the local one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({
  storeLogout: vi.fn(),
  removeUser: vi.fn(),
  signoutRedirect: vi.fn(),
}))

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ removeUser: h.removeUser, signoutRedirect: h.signoutRedirect }),
}))

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) => selector({ logout: h.storeLogout }),
}))

import { useLogout } from '@/auth/useLogout'

describe('useLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.removeUser.mockResolvedValue(undefined)
    h.signoutRedirect.mockResolvedValue(undefined)
  })

  it('clears the local store, removes the OIDC user, and redirects to end the IdP session', async () => {
    const { result } = renderHook(() => useLogout())
    await result.current()

    expect(h.storeLogout).toHaveBeenCalledTimes(1)
    expect(h.removeUser).toHaveBeenCalledTimes(1)
    expect(h.signoutRedirect).toHaveBeenCalledTimes(1)
  })

  it('clears the local store first, before touching the OIDC session', async () => {
    const order: string[] = []
    h.storeLogout.mockImplementation(() => order.push('store'))
    h.removeUser.mockImplementation(async () => {
      order.push('removeUser')
    })
    h.signoutRedirect.mockImplementation(async () => {
      order.push('signoutRedirect')
    })

    const { result } = renderHook(() => useLogout())
    await result.current()

    expect(order).toEqual(['store', 'removeUser', 'signoutRedirect'])
  })

  it('does not throw when the OIDC round trip fails — the local session is already cleared', async () => {
    h.removeUser.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useLogout())

    await expect(result.current()).resolves.toBeUndefined()
    expect(h.storeLogout).toHaveBeenCalledTimes(1)
  })
})
