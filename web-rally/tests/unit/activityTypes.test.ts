/**
 * Test suite for activityTypes.ts type guards — runtime discrimination of
 * ActivityConfig variants by their distinguishing fields.
 */
import { describe, it, expect } from 'vitest'
import {
  isTimeBasedConfig,
  isScoreBasedConfig,
  isBooleanConfig,
  isTeamVsConfig,
  isGeneralConfig,
} from '@/types/activityTypes'

describe('activityTypes type guards', () => {
  describe('isTimeBasedConfig', () => {
    it('returns true when max_time_seconds is present', () => {
      expect(isTimeBasedConfig({ max_time_seconds: 60 })).toBe(true)
    })

    it('returns true when points_per_second is present', () => {
      expect(isTimeBasedConfig({ points_per_second: 2 })).toBe(true)
    })

    it('returns false for unrelated config', () => {
      expect(isTimeBasedConfig({ default_points: 10 })).toBe(false)
    })
  })

  describe('isScoreBasedConfig', () => {
    it('returns true when points_per_score is present', () => {
      expect(isScoreBasedConfig({ points_per_score: 5 })).toBe(true)
    })

    it('returns false when absent', () => {
      expect(isScoreBasedConfig({ default_points: 10 })).toBe(false)
    })
  })

  describe('isBooleanConfig', () => {
    it('returns true when success_points is present', () => {
      expect(isBooleanConfig({ success_points: 10 })).toBe(true)
    })

    it('returns true when failure_points is present', () => {
      expect(isBooleanConfig({ failure_points: -5 })).toBe(true)
    })

    it('returns false when absent', () => {
      expect(isBooleanConfig({ default_points: 10 })).toBe(false)
    })
  })

  describe('isTeamVsConfig', () => {
    it.each([
      ['win_points', { win_points: 10 }],
      ['lose_points', { lose_points: 0 }],
      ['draw_points', { draw_points: 5 }],
      ['base_points', { base_points: 1 }],
      ['completion_points', { completion_points: 2 }],
    ])('returns true when %s is present', (_label, config) => {
      expect(isTeamVsConfig(config)).toBe(true)
    })

    it('returns false when none of the discriminating fields are present', () => {
      expect(isTeamVsConfig({ default_points: 10 })).toBe(false)
    })
  })

  describe('isGeneralConfig', () => {
    it('returns true when default_points is present', () => {
      expect(isGeneralConfig({ default_points: 10 })).toBe(true)
    })

    it('returns false when absent', () => {
      expect(isGeneralConfig({ points_per_score: 5 })).toBe(false)
    })
  })
})
