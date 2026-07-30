/**
 * Additional coverage for timezone.ts — functions and branches not exercised
 * by tests/unit/timezone.test.ts: malformed datetime-local parsing,
 * human-readable formatters, UTC validation, current-time getters, and the
 * catch branches of the try/catch-wrapped helpers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  localDatetimeLocalToUTCISOString,
  utcISOStringToLocalDatetimeLocal,
  utcISOStringToLocalTimeString,
  utcISOStringToLocalDateString,
  utcISOStringToLocalDateTimeString,
  getCurrentUTCISOString,
  getCurrentLocalDatetimeLocal,
  isValidUTCISOString,
  isValidDatetimeLocalString,
  formatDatetimeForDisplay,
  parseDatetimeLocal,
  formatDatetimeLocal,
} from '@/utils/timezone'

describe('timezone.ts additional coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('localDatetimeLocalToUTCISOString malformed input', () => {
    it('returns null when missing the T separator (no time part)', () => {
      expect(localDatetimeLocalToUTCISOString('2024-01-15')).toBeNull()
    })

    it('returns null when date has the wrong number of segments', () => {
      expect(localDatetimeLocalToUTCISOString('2024-01T14:30')).toBeNull()
    })

    it('returns null when time has the wrong number of segments', () => {
      expect(localDatetimeLocalToUTCISOString('2024-01-15T14:30:00')).toBeNull()
    })

    it('returns null when date parts are non-numeric', () => {
      expect(localDatetimeLocalToUTCISOString('abcd-01-15T14:30')).toBeNull()
    })

    it('returns null when time parts are non-numeric', () => {
      expect(localDatetimeLocalToUTCISOString('2024-01-15Tab:30')).toBeNull()
    })
  })

  describe('utcISOStringToLocalDatetimeLocal invalid input', () => {
    it('returns null for an unparsable string', () => {
      expect(utcISOStringToLocalDatetimeLocal('not-a-date')).toBeNull()
    })

    it('returns null when Date construction throws', () => {
      const RealDate = global.Date
      global.Date = class extends RealDate {
        constructor() {
          super()
          throw new Error('boom')
        }
      } as any
      expect(utcISOStringToLocalDatetimeLocal('2024-01-15T13:30:00.000Z')).toBeNull()
      global.Date = RealDate
    })
  })

  describe('utcISOStringToLocalTimeString', () => {
    it('formats a UTC time using default options', () => {
      const result = utcISOStringToLocalTimeString('2024-01-15T13:30:00.000Z')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('respects custom formatting options', () => {
      const result = utcISOStringToLocalTimeString('2024-01-15T13:30:00.000Z', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      expect(typeof result).toBe('string')
    })
  })

  describe('utcISOStringToLocalDateString', () => {
    it('formats a UTC date using default options', () => {
      const result = utcISOStringToLocalDateString('2024-01-15T13:30:00.000Z')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('utcISOStringToLocalDateTimeString', () => {
    it('formats a UTC datetime using default options', () => {
      const result = utcISOStringToLocalDateTimeString('2024-01-15T13:30:00.000Z')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('getCurrentUTCISOString', () => {
    it('returns a valid ISO string', () => {
      const result = getCurrentUTCISOString()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })
  })

  describe('getCurrentLocalDatetimeLocal', () => {
    it('returns a datetime-local formatted string', () => {
      const result = getCurrentLocalDatetimeLocal()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })
  })

  describe('isValidUTCISOString', () => {
    it('returns true for a valid UTC ISO string', () => {
      expect(isValidUTCISOString('2024-01-15T13:30:00.000Z')).toBe(true)
    })

    it('returns false when the string has no Z suffix', () => {
      expect(isValidUTCISOString('2024-01-15T13:30:00.000')).toBe(false)
    })

    it('returns false for an unparsable string', () => {
      expect(isValidUTCISOString('not-a-date')).toBe(false)
    })

    it('returns false when Date construction throws', () => {
      const RealDate = global.Date
      global.Date = class extends RealDate {
        constructor() {
          super()
          throw new Error('boom')
        }
      } as any
      expect(isValidUTCISOString('2024-01-15T13:30:00.000Z')).toBe(false)
      global.Date = RealDate
    })
  })

  describe('isValidDatetimeLocalString', () => {
    it('returns true for a well-formed datetime-local string', () => {
      expect(isValidDatetimeLocalString('2024-01-15T13:30')).toBe(true)
    })

    it('returns false for a malformed string', () => {
      expect(isValidDatetimeLocalString('not-a-date')).toBe(false)
    })

    it('returns false when Date construction throws', () => {
      const RealDate = global.Date
      global.Date = class extends RealDate {
        constructor() {
          super()
          throw new Error('boom')
        }
      } as any
      expect(isValidDatetimeLocalString('2024-01-15T13:30')).toBe(false)
      global.Date = RealDate
    })
  })

  describe('formatDatetimeForDisplay invalid input', () => {
    it('returns N/A for an unparsable string', () => {
      expect(formatDatetimeForDisplay('not-a-date')).toBe('N/A')
    })

    it('returns N/A when Date construction throws', () => {
      const RealDate = global.Date
      global.Date = class extends RealDate {
        constructor() {
          super()
          throw new Error('boom')
        }
      } as any
      expect(formatDatetimeForDisplay('2024-01-15T13:30:00.000Z')).toBe('N/A')
      global.Date = RealDate
    })
  })

  describe('parseDatetimeLocal invalid input', () => {
    it('returns null for an unparsable string', () => {
      expect(parseDatetimeLocal('not-a-date')).toBeNull()
    })

    it('returns null when Date construction throws', () => {
      const RealDate = global.Date
      global.Date = class extends RealDate {
        constructor() {
          super()
          throw new Error('boom')
        }
      } as any
      expect(parseDatetimeLocal('2024-01-15T13:30')).toBeNull()
      global.Date = RealDate
    })
  })

  describe('formatDatetimeLocal error branch', () => {
    it('returns null when the Date object throws while formatting', () => {
      const brokenDate = {
        getFullYear: () => {
          throw new Error('boom')
        },
      } as unknown as Date
      expect(formatDatetimeLocal(brokenDate)).toBeNull()
    })
  })
})
