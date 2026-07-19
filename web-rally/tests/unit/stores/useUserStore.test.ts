/**
 * Test suite for the user store (Zustand). Identity is now driven by the OIDC
 * layer via setSession/clearSession; logout also clears team auth.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { useUserStore } from '@/stores/useUserStore'

vi.mock('@/lib/auth/tokenStore', () => ({
  clearAllAuth: vi.fn(),
}))

describe('useUserStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUserStore.getState().clearSession()
  })

  describe('setSession', () => {
    it('sets token + identity and marks authenticated', () => {
      act(() => {
        useUserStore.getState().setSession({
          token: 'access-token',
          user: { sub: 'uuid-1', scopes: ['admin', 'manager-rally'], name: 'Test User', email: 'test@example.com' },
        })
      })

      const state = useUserStore.getState()
      expect(state.token).toBe('access-token')
      expect(state.sub).toBe('uuid-1')
      expect(state.scopes).toEqual(['admin', 'manager-rally'])
      expect(state.name).toBe('Test User')
      expect(state.email).toBe('test@example.com')
      expect(state.sessionLoading).toBe(false)
      expect(state.isAuthenticated).toBe(true)
    })

    it('handles empty scopes (authenticated, no roles)', () => {
      act(() => {
        useUserStore.getState().setSession({
          token: 't',
          user: { sub: 'uuid-1', scopes: [], name: 'Test User' },
        })
      })
      const state = useUserStore.getState()
      expect(state.scopes).toEqual([])
      expect(state.isAuthenticated).toBe(true)
    })

    it('is not authenticated when sub is missing', () => {
      act(() => {
        useUserStore.getState().setSession({ token: 't', user: { scopes: ['admin'] } })
      })
      expect(useUserStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe('clearSession', () => {
    it('resolves the session as unauthenticated and resets identity', () => {
      act(() => {
        useUserStore.getState().setSession({ token: 't', user: { sub: 'uuid-1', scopes: ['admin'] } })
      })
      act(() => {
        useUserStore.getState().clearSession()
      })

      const state = useUserStore.getState()
      expect(state.sub).toBeUndefined()
      expect(state.token).toBeUndefined()
      expect(state.scopes).toBeUndefined()
      expect(state.sessionLoading).toBe(false)
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears all auth (incl. team) and resets identity', async () => {
      const { clearAllAuth } = await import('@/lib/auth/tokenStore')

      act(() => {
        useUserStore.getState().setSession({ token: 't', user: { sub: 'uuid-1', scopes: ['admin'] } })
      })
      act(() => {
        useUserStore.getState().logout()
      })

      expect(clearAllAuth).toHaveBeenCalled()
      const state = useUserStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.sub).toBeUndefined()
    })
  })

  describe('scope checking', () => {
    it('exposes mapped scopes for gating', () => {
      act(() => {
        useUserStore.getState().setSession({
          token: 't',
          user: { sub: 'uuid-1', scopes: ['admin', 'rally-staff'] },
        })
      })
      const { scopes } = useUserStore.getState()
      expect(scopes?.includes('admin')).toBe(true)
      expect(scopes?.includes('rally-staff')).toBe(true)
      expect(scopes?.includes('super-admin')).toBe(false)
    })
  })
})
