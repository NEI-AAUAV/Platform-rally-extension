/**
 * Test suite for useLoginLink hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useHref: vi.fn(),
  }
})

describe('useLoginLink Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate login link with redirect', () => {
    const { useHref } = await import('react-router-dom')
    vi.mocked(useHref).mockReturnValue('/rally/scoreboard')

    const { result } = renderHook(() => useLoginLink(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          {children}
        </MemoryRouter>
      ),
    })

    const loginLink = result.current
    expect(loginLink).toContain('https://nei.web.ua.pt/auth/login')
    expect(loginLink).toContain('redirect_to')
  })

  it('should include current pathname in redirect', () => {
    const { useHref } = await import('react-router-dom')
    vi.mocked(useHref).mockReturnValue('/rally/admin')

    const { result } = renderHook(() => useLoginLink(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          {children}
        </MemoryRouter>
      ),
    })

    const loginLink = result.current
    const url = new URL(loginLink)
    const redirectTo = url.searchParams.get('redirect_to')
    
    expect(redirectTo).toContain('https://nei.web.ua.pt/rally/admin')
  })

  it('should use BASE_URL from config', () => {
    const { useHref } = await import('react-router-dom')
    vi.mocked(useHref).mockReturnValue('/rally')

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

