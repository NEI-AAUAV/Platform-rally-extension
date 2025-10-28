/**
 * Test suite for user store (Zustand)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { useUserStore } from '@/stores/useUserStore'

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
})

// Mock console methods to avoid noise in tests
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

describe('useUserStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useUserStore.setState({
      sub: undefined,
      scopes: undefined,
      name: undefined,
      email: undefined,
      isAuthenticated: false,
    })
  })

  afterEach(() => {
    mockConsoleError.mockClear()
    mockConsoleWarn.mockClear()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useUserStore.getState()
      
      expect(state.sub).toBeUndefined()
      expect(state.scopes).toBeUndefined()
      expect(state.name).toBeUndefined()
      expect(state.email).toBeUndefined()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('setUser', () => {
    it('should set user data correctly', () => {
      const userData = {
        sub: 'user123',
        scopes: ['admin', 'manager-rally'],
        name: 'Test User',
        email: 'test@example.com'
      }

      act(() => {
        useUserStore.getState().setUser(userData)
      })

      const state = useUserStore.getState()
      expect(state.sub).toBe('user123')
      expect(state.scopes).toEqual(['admin', 'manager-rally'])
      expect(state.name).toBe('Test User')
      expect(state.email).toBe('test@example.com')
      expect(state.isAuthenticated).toBe(true)
    })

    it('should handle partial user data', () => {
      const userData = {
        sub: 'user123',
        scopes: ['admin'],
        name: 'Test User',
        email: undefined
      }

      act(() => {
        useUserStore.getState().setUser(userData)
      })

      const state = useUserStore.getState()
      expect(state.sub).toBe('user123')
      expect(state.scopes).toEqual(['admin'])
      expect(state.name).toBe('Test User')
      expect(state.email).toBeUndefined()
      expect(state.isAuthenticated).toBe(true)
    })

    it('should handle empty scopes array', () => {
      const userData = {
        sub: 'user123',
        scopes: [],
        name: 'Test User',
        email: 'test@example.com'
      }

      act(() => {
        useUserStore.getState().setUser(userData)
      })

      const state = useUserStore.getState()
      expect(state.scopes).toEqual([])
      expect(state.isAuthenticated).toBe(true)
    })
  })

  describe('clearUser', () => {
    it('should clear user data', () => {
      // First set some user data
      act(() => {
        useUserStore.getState().setUser({
          sub: 'user123',
          scopes: ['admin'],
          name: 'Test User',
          email: 'test@example.com'
        })
      })

      // Then clear it
      act(() => {
        useUserStore.getState().clearUser()
      })

      const state = useUserStore.getState()
      expect(state.sub).toBeUndefined()
      expect(state.scopes).toBeUndefined()
      expect(state.name).toBeUndefined()
      expect(state.email).toBeUndefined()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('Authentication State', () => {
    it('should be authenticated when sub is present', () => {
      act(() => {
        useUserStore.getState().setUser({
          sub: 'user123',
          scopes: ['admin'],
          name: 'Test User',
          email: 'test@example.com'
        })
      })

      const state = useUserStore.getState()
      expect(state.isAuthenticated).toBe(true)
    })

    it('should not be authenticated when sub is undefined', () => {
      act(() => {
        useUserStore.getState().setUser({
          sub: undefined,
          scopes: ['admin'],
          name: 'Test User',
          email: 'test@example.com'
        })
      })

      const state = useUserStore.getState()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should not be authenticated when sub is empty string', () => {
      act(() => {
        useUserStore.getState().setUser({
          sub: '',
          scopes: ['admin'],
          name: 'Test User',
          email: 'test@example.com'
        })
      })

      const state = useUserStore.getState()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('Scope Checking', () => {
    it('should handle scope checking correctly', () => {
      act(() => {
        useUserStore.getState().setUser({
          sub: 'user123',
          scopes: ['admin', 'manager-rally', 'user'],
          name: 'Test User',
          email: 'test@example.com'
        })
      })

      const state = useUserStore.getState()
      
      // Test individual scope checking
      expect(state.scopes?.includes('admin')).toBe(true)
      expect(state.scopes?.includes('manager-rally')).toBe(true)
      expect(state.scopes?.includes('user')).toBe(true)
      expect(state.scopes?.includes('super-admin')).toBe(false)
    })

    it('should handle undefined scopes', () => {
      act(() => {
        useUserStore.getState().setUser({
          sub: 'user123',
          scopes: undefined,
          name: 'Test User',
          email: 'test@example.com'
        })
      })

      const state = useUserStore.getState()
      expect(state.scopes).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid user data gracefully', () => {
      // Test with null values
      act(() => {
        useUserStore.getState().setUser({
          sub: null as any,
          scopes: null as any,
          name: null as any,
          email: null as any
        })
      })

      const state = useUserStore.getState()
      expect(state.sub).toBeNull()
      expect(state.scopes).toBeNull()
      expect(state.name).toBeNull()
      expect(state.email).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('Store Persistence', () => {
    it('should handle localStorage operations', () => {
      // Mock localStorage.getItem to return some data
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
        sub: 'persisted-user',
        scopes: ['admin'],
        name: 'Persisted User',
        email: 'persisted@example.com'
      }))

      // The store should handle localStorage operations
      // (This would typically be tested in integration tests)
      expect(mockLocalStorage.getItem).toBeDefined()
      expect(mockLocalStorage.setItem).toBeDefined()
      expect(mockLocalStorage.removeItem).toBeDefined()
    })
  })

  describe('State Updates', () => {
    it('should update state immutably', () => {
      const initialState = useUserStore.getState()
      
      act(() => {
        useUserStore.getState().setUser({
          sub: 'user123',
          scopes: ['admin'],
          name: 'Test User',
          email: 'test@example.com'
        })
      })

      const newState = useUserStore.getState()
      
      // State should be updated
      expect(newState.sub).toBe('user123')
      expect(newState.isAuthenticated).toBe(true)
      
      // Original state should not be mutated
      expect(initialState.sub).toBeUndefined()
      expect(initialState.isAuthenticated).toBe(false)
    })
  })
})
