/**
 * Test suite for useStaffLogin — starts the authentik PKCE flow and remembers
 * the return URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import useStaffLogin from '@/hooks/useLoginLink'

const signinRedirect = vi.fn()

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ signinRedirect }),
}))

function wrapper(initialPath: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  )
}

describe('useStaffLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('triggers signinRedirect when invoked', () => {
    const { result } = renderHook(() => useStaffLogin(), { wrapper: wrapper('/scoreboard') })
    result.current()
    expect(signinRedirect).toHaveBeenCalledTimes(1)
  })

  it('stores the current path as the return URL', () => {
    const { result } = renderHook(() => useStaffLogin(), { wrapper: wrapper('/admin') })
    result.current()
    expect(sessionStorage.getItem('rally_auth_return_url')).toBe('/admin')
  })
})
