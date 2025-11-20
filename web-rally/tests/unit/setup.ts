import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Ensure URL and URLSearchParams are available globally for jsdom
// This is needed for packages like whatwg-url that expect these globals
if (typeof globalThis.URL === 'undefined') {
  // Use Node.js built-in URL if available (synchronous require for setup file)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { URL, URLSearchParams } = require('url')
    globalThis.URL = URL as typeof globalThis.URL
    globalThis.URLSearchParams = URLSearchParams as typeof globalThis.URLSearchParams
  } catch {
    // Fallback: jsdom should provide these, but ensure they exist
    if (typeof window !== 'undefined' && window.URL) {
      globalThis.URL = window.URL
      globalThis.URLSearchParams = window.URLSearchParams
    }
  }
}

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))
