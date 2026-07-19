import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }))

vi.mock('@sentry/react', () => ({
  init: h.init,
  captureException: h.captureException,
}))

import { initSentry, captureError } from '@/lib/sentry'

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('is a no-op when no DSN is configured', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    initSentry()
    expect(h.init).not.toHaveBeenCalled()
  })

  it('initialises Sentry when a DSN is configured', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.ingest.sentry.io/1')
    initSentry()
    expect(h.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example.ingest.sentry.io/1',
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
      }),
    )
  })
})

describe('captureError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports the error without extra context', () => {
    const err = new Error('boom')
    captureError(err)
    expect(h.captureException).toHaveBeenCalledWith(err, undefined)
  })

  it('reports the error with extra context', () => {
    const err = new Error('boom')
    captureError(err, { teamId: 5 })
    expect(h.captureException).toHaveBeenCalledWith(err, { extra: { teamId: 5 } })
  })
})
