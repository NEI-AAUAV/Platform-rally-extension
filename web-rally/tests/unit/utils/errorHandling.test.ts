/**
 * Test suite for errorHandling.ts — extracting user-friendly error messages
 * from various error shapes (API errors, Axios errors, standard Error).
 */
import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '@/utils/errorHandling'

describe('getErrorMessage', () => {
  it('returns fallback when error is null', () => {
    expect(getErrorMessage(null, 'fallback')).toBe('fallback')
  })

  it('returns fallback when error is undefined', () => {
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback')
  })

  it('returns fallback when error is not an object', () => {
    expect(getErrorMessage('string error', 'fallback')).toBe('fallback')
    expect(getErrorMessage(42, 'fallback')).toBe('fallback')
  })

  it('extracts top-level detail (generated client throwOnError shape) when present', () => {
    const error = { detail: 'Image upload is disabled: R2 storage is not configured.' }
    expect(getErrorMessage(error, 'fallback')).toBe(
      'Image upload is disabled: R2 storage is not configured.',
    )
  })

  it('prefers top-level detail over body.detail', () => {
    const error = { detail: 'from top level', body: { detail: 'from body' } }
    expect(getErrorMessage(error, 'fallback')).toBe('from top level')
  })

  it('ignores non-string top-level detail', () => {
    const error = { detail: 123, message: 'Network failure' }
    expect(getErrorMessage(error, 'fallback')).toBe('Network failure')
  })

  it('extracts body.detail when present', () => {
    const error = { body: { detail: 'Team not found' } }
    expect(getErrorMessage(error, 'fallback')).toBe('Team not found')
  })

  it('extracts response.data.detail (Axios format) when body.detail is absent', () => {
    const error = { response: { data: { detail: 'Unauthorized' } } }
    expect(getErrorMessage(error, 'fallback')).toBe('Unauthorized')
  })

  it('prefers body.detail over response.data.detail', () => {
    const error = {
      body: { detail: 'from body' },
      response: { data: { detail: 'from response' } },
    }
    expect(getErrorMessage(error, 'fallback')).toBe('from body')
  })

  it('falls back to standard Error message', () => {
    const error = new Error('Network failure')
    expect(getErrorMessage(error, 'fallback')).toBe('Network failure')
  })

  it('ignores an empty message string and returns fallback', () => {
    const error = { message: '' }
    expect(getErrorMessage(error, 'fallback')).toBe('fallback')
  })

  it('returns fallback when no recognizable field is present', () => {
    const error = { foo: 'bar' }
    expect(getErrorMessage(error, 'fallback')).toBe('fallback')
  })

  it('ignores non-string body.detail', () => {
    const error = { body: { detail: 123 } }
    expect(getErrorMessage(error, 'fallback')).toBe('fallback')
  })

  it('ignores non-string response.data.detail', () => {
    const error = { response: { data: { detail: null } } }
    expect(getErrorMessage(error, 'fallback')).toBe('fallback')
  })
})
