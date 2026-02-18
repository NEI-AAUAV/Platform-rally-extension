/**
 * Test suite for timeFormat utility
 */
import { describe, it, expect } from 'vitest'
import { formatTime } from '@/utils/timeFormat'

describe('formatTime', () => {
  describe('null/undefined/falsy inputs', () => {
    it('should return "--:--" for null', () => {
      expect(formatTime(null)).toBe('--:--')
    })

    it('should return "--:--" for undefined', () => {
      expect(formatTime(undefined)).toBe('--:--')
    })
  })

  describe('invalid inputs', () => {
    it('should return "--:--" for invalid date string', () => {
      expect(formatTime('not-a-date')).toBe('--:--')
    })

    it('should return "--:--" for empty string', () => {
      expect(formatTime('')).toBe('--:--')
    })

    it('should return "--:--" for Invalid Date object', () => {
      expect(formatTime(new Date('invalid'))).toBe('--:--')
    })
  })

  describe('valid Date objects', () => {
    it('should format hours and minutes with leading zeros', () => {
      // Use a fixed UTC date and check local time formatting
      const date = new Date(2024, 0, 15, 9, 5, 0) // Jan 15 2024, 09:05
      const result = formatTime(date)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
      // Hours and minutes should be padded
      const [hours, minutes] = result.split(':')
      expect(hours.length).toBe(2)
      expect(minutes.length).toBe(2)
    })

    it('should format midnight as 00:00', () => {
      const date = new Date(2024, 0, 15, 0, 0, 0)
      expect(formatTime(date)).toBe('00:00')
    })

    it('should format noon correctly', () => {
      const date = new Date(2024, 0, 15, 12, 30, 0)
      expect(formatTime(date)).toBe('12:30')
    })

    it('should pad single-digit minutes', () => {
      const date = new Date(2024, 0, 15, 10, 5, 0)
      const result = formatTime(date)
      const minutes = result.split(':')[1]
      expect(minutes).toBe('05')
    })

    it('should pad single-digit hours', () => {
      const date = new Date(2024, 0, 15, 9, 30, 0)
      const result = formatTime(date)
      const hours = result.split(':')[0]
      expect(hours).toBe('09')
    })
  })

  describe('valid ISO strings', () => {
    it('should parse and format an ISO string', () => {
      // Create a date, get its ISO string, and verify formatTime returns HH:MM
      const date = new Date(2024, 5, 20, 14, 45, 0)
      const iso = date.toISOString()
      const result = formatTime(iso)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })

    it('should return "--:--" for a clearly invalid ISO string', () => {
      expect(formatTime('2024-99-99T99:99:99Z')).toBe('--:--')
    })
  })
})
