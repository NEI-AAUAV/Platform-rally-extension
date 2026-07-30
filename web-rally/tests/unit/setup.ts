import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { URL as NodeURL, URLSearchParams as NodeURLSearchParams } from 'node:url'

// Ensure URL and URLSearchParams are available globally for jsdom
// This is needed for packages like whatwg-url that expect these globals
if (typeof globalThis.URL === 'undefined') {
  globalThis.URL = NodeURL as unknown as typeof globalThis.URL
  globalThis.URLSearchParams = NodeURLSearchParams as unknown as typeof globalThis.URLSearchParams
}

// jsdom 28 / Node expose an inert `localStorage` global (it requires
// `--localstorage-file` to function), which shadows window storage in the test
// runner. Install a deterministic in-memory Storage so storage-backed hooks and
// stores behave consistently across tests.
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, name, { value: storage, writable: true, configurable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { value: storage, writable: true, configurable: true })
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
