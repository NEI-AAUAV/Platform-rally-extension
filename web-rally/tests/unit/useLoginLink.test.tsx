/**
 * Test suite for useStaffLogin — starts the authentik PKCE flow and remembers
 * the return URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import useStaffLogin from '@/hooks/useLoginLink'

const signinRedirect = vi.fn()

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ signinRedirect }),
}))

// useStaffLogin reads TanStack's ParsedLocation.href; mock it so the hook can
// be exercised without a full router context.
let mockHref = '/'
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ href: mockHref }),
}))

describe('useStaffLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockHref = '/'
  })

  it('triggers signinRedirect when invoked', () => {
    mockHref = '/scoreboard'
    const { result } = renderHook(() => useStaffLogin())
    result.current()
    expect(signinRedirect).toHaveBeenCalledTimes(1)
  })

  it('stores the current path as the return URL', () => {
    mockHref = '/admin'
    const { result } = renderHook(() => useStaffLogin())
    result.current()
    expect(sessionStorage.getItem('rally_auth_return_url')).toBe('/admin')
  })
})
