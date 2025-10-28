/**
 * Test suite for timezone utility functions
 */
import { describe, it, expect } from 'vitest'
import {
  localDatetimeLocalToUTCISOString,
  utcISOStringToLocalDatetimeLocal,
  isValidDatetimeLocalString,
  formatDatetimeForDisplay,
  getTimezoneOffset,
  parseDatetimeLocal,
  formatDatetimeLocal
} from '@/utils/timezone'

describe('Timezone Utilities', () => {
  describe('localDatetimeLocalToUTCISOString', () => {
    it('should convert local datetime-local to UTC ISO string', () => {
      const localTime = '2024-01-15T14:30'
      const result = localDatetimeLocalToUTCISOString(localTime)
      
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(result).toContain('Z') // Should end with Z for UTC
    })

    it('should handle null input', () => {
      const result = localDatetimeLocalToUTCISOString(null as any)
      expect(result).toBeNull()
    })

    it('should handle empty string', () => {
      const result = localDatetimeLocalToUTCISOString('')
      expect(result).toBeNull()
    })

    it('should preserve date and time components', () => {
      const localTime = '2024-12-25T23:59'
      const result = localDatetimeLocalToUTCISOString(localTime)
      
      // Parse the result to verify components
      const date = new Date(result!)
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(11) // December is month 11
      expect(date.getDate()).toBe(25)
    })
  })

  describe('utcISOStringToLocalDatetimeLocal', () => {
    it('should convert UTC ISO string to local datetime-local', () => {
      const utcTime = '2024-01-15T13:30:00.000Z'
      const result = utcISOStringToLocalDatetimeLocal(utcTime)
      
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      expect(result).not.toContain('Z') // Should not contain Z
    })

    it('should handle null input', () => {
      const result = utcISOStringToLocalDatetimeLocal(null as any)
      expect(result).toBeNull()
    })

    it('should handle empty string', () => {
      const result = utcISOStringToLocalDatetimeLocal('')
      expect(result).toBeNull()
    })

    it('should convert back and forth consistently', () => {
      const originalLocal = '2024-01-15T14:30'
      const utc = localDatetimeLocalToUTCISOString(originalLocal)
      const backToLocal = utcISOStringToLocalDatetimeLocal(utc!)
      
      // Should be the same (accounting for timezone conversion)
      expect(backToLocal).toBe(originalLocal)
    })
  })

  describe('isValidDatetimeLocalString', () => {
    it('should validate correct datetime-local format', () => {
      expect(isValidDatetimeLocalString('2024-01-15T14:30')).toBe(true)
      expect(isValidDatetimeLocalString('2024-12-31T23:59')).toBe(true)
      expect(isValidDatetimeLocalString('2024-02-29T12:00')).toBe(true) // Leap year
    })

    it('should reject invalid formats', () => {
      expect(isValidDatetimeLocalString('2024-01-15')).toBe(false) // Missing time
      expect(isValidDatetimeLocalString('14:30')).toBe(false) // Missing date
      expect(isValidDatetimeLocalString('2024-13-01T14:30')).toBe(false) // Invalid month
      expect(isValidDatetimeLocalString('2024-01-32T14:30')).toBe(false) // Invalid day
      expect(isValidDatetimeLocalString('2024-01-15T25:30')).toBe(false) // Invalid hour
      expect(isValidDatetimeLocalString('2024-01-15T14:60')).toBe(false) // Invalid minute
      expect(isValidDatetimeLocalString('invalid')).toBe(false)
      expect(isValidDatetimeLocalString('')).toBe(false)
    })

    it('should handle edge cases', () => {
      expect(isValidDatetimeLocalString('2024-01-15T00:00')).toBe(true) // Midnight
      expect(isValidDatetimeLocalString('2024-01-15T23:59')).toBe(true) // End of day
    })
  })

  describe('formatDatetimeForDisplay', () => {
    it('should format datetime for display', () => {
      const utcTime = '2024-01-15T13:30:00.000Z'
      const result = formatDatetimeForDisplay(utcTime)
      
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    })

    it('should handle null input', () => {
      const result = formatDatetimeForDisplay(null as any)
      expect(result).toBe('N/A')
    })

    it('should handle empty string', () => {
      const result = formatDatetimeForDisplay('')
      expect(result).toBe('N/A')
    })
  })

  describe('getTimezoneOffset', () => {
    it('should return timezone offset in minutes', () => {
      const offset = getTimezoneOffset()
      
      expect(typeof offset).toBe('number')
      expect(Math.abs(offset % 60)).toBe(0) // Should be divisible by 60 (whole hours)
    })
  })

  describe('parseDatetimeLocal', () => {
    it('should parse datetime-local string', () => {
      const result = parseDatetimeLocal('2024-01-15T14:30')
      
      expect(result).toBeInstanceOf(Date)
      expect(result).not.toBeNull()
      if (result) {
        expect(result.getFullYear()).toBe(2024)
        expect(result.getMonth()).toBe(0) // January is month 0
        expect(result.getDate()).toBe(15)
        expect(result.getHours()).toBe(14)
        expect(result.getMinutes()).toBe(30)
      }
    })

    it('should handle invalid input', () => {
      const result = parseDatetimeLocal('invalid')
      expect(result).toBeNull()
    })
  })

  describe('formatDatetimeLocal', () => {
    it('should format Date to datetime-local string', () => {
      const date = new Date(2024, 0, 15, 14, 30) // January 15, 2024, 14:30
      const result = formatDatetimeLocal(date)
      
      expect(result).toBe('2024-01-15T14:30')
    })

    it('should handle null input', () => {
      const result = formatDatetimeLocal(null as any)
      expect(result).toBeNull()
    })

    it('should pad single digits', () => {
      const date = new Date(2024, 0, 5, 9, 5) // January 5, 2024, 09:05
      const result = formatDatetimeLocal(date)
      
      expect(result).toBe('2024-01-05T09:05')
    })
  })

  describe('Integration Tests', () => {
    it('should handle complete conversion cycle', () => {
      const originalLocal = '2024-01-15T14:30'
      
      // Convert to UTC
      const utc = localDatetimeLocalToUTCISOString(originalLocal)
      expect(utc).toBeTruthy()
      
      // Convert back to local
      const backToLocal = utcISOStringToLocalDatetimeLocal(utc!)
      expect(backToLocal).toBe(originalLocal)
      
      // Validate the result
      expect(isValidDatetimeLocalString(backToLocal!)).toBe(true)
    })

    it('should handle different timezones consistently', () => {
      const testTimes = [
        '2024-01-15T00:00', // Midnight
        '2024-01-15T12:00', // Noon
        '2024-01-15T23:59', // End of day
        '2024-12-31T12:00', // End of year
      ]
      
      testTimes.forEach(time => {
        const utc = localDatetimeLocalToUTCISOString(time)
        const backToLocal = utcISOStringToLocalDatetimeLocal(utc!)
        
        expect(backToLocal).toBe(time)
        expect(isValidDatetimeLocalString(backToLocal!)).toBe(true)
      })
    })
  })
})
