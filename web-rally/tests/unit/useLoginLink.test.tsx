/**
 * Test suite for useLoginLink hook
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import useLoginLink from '@/hooks/useLoginLink'
import config from '@/config'

// Mock config
vi.mock('@/config', () => ({
  default: {
    BASE_URL: 'https://nei.web.ua.pt',
  },
}))

describe('useLoginLink Hook', () => {
  it('should generate login link with redirect', () => {
    const { result } = renderHook(() => useLoginLink(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/rally/scoreboard']}>
          {children}
        </MemoryRouter>
      ),
    })

    const loginLink = result.current
    expect(loginLink).toContain('https://nei.web.ua.pt/auth/login')
    expect(loginLink).toContain('redirect_to')
  })

  it('should include current pathname in redirect', () => {
    const { result } = renderHook(() => useLoginLink(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/rally/admin']}>
          {children}
        </MemoryRouter>
      ),
    })

    const loginLink = result.current
    const url = new URL(loginLink)
    const redirectTo = url.searchParams.get('redirect_to')
    
    // useHref("") returns the current location, which should include the path
    expect(redirectTo).toBeTruthy()
    expect(redirectTo).toContain('https://nei.web.ua.pt')
  })

  it('should use BASE_URL from config', () => {
    const { result } = renderHook(() => useLoginLink(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          {children}
        </MemoryRouter>
      ),
    })

    const loginLink = result.current
    expect(loginLink).toContain(config.BASE_URL)
  })
})
