import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  useExtraShotsAndPenalties,
  getSubmitLabel,
} from '@/hooks/useExtraShotsAndPenalties'
import type { Team } from '@/types/forms'

const { mockUseRallySettings, mockToast } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}))

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}))

describe('useExtraShotsAndPenalties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRallySettings.mockReturnValue({ settings: undefined })
  })

  it('computes maxExtraShots from team size and default per-member config', () => {
    const team = { id: 1, name: 'Team A', num_members: 4 } as unknown as Team
    const { result } = renderHook(() => useExtraShotsAndPenalties(team, undefined))

    expect(result.current.maxExtraShotsPerMember).toBe(5)
    expect(result.current.maxExtraShots).toBe(20)
    expect(result.current.showExtraShots).toBe(true)
  })

  it('defaults team size to 1 when team is undefined', () => {
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, undefined))
    expect(result.current.maxExtraShots).toBe(5)
  })

  it('uses members array length when num_members is absent', () => {
    const team = { id: 1, name: 'Team B', members: [{ id: 1 }, { id: 2 }, { id: 3 }] } as unknown as Team
    const { result } = renderHook(() => useExtraShotsAndPenalties(team, undefined))
    expect(result.current.maxExtraShots).toBe(15)
  })

  it('hides extra shots when settings configure zero per member', () => {
    mockUseRallySettings.mockReturnValue({
      settings: { max_extra_shots_per_member: 0 },
    })
    const team = { id: 1, name: 'Team A', num_members: 4 } as unknown as Team
    const { result } = renderHook(() => useExtraShotsAndPenalties(team, undefined))
    expect(result.current.showExtraShots).toBe(false)
  })

  it('shows vomit penalty when configured value is positive', () => {
    mockUseRallySettings.mockReturnValue({
      settings: { penalty_per_puke: 3, penalty_per_not_drinking: 0 },
    })
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, undefined))
    expect(result.current.showVomitPenalty).toBe(true)
    expect(result.current.showNotDrinkingPenalty).toBe(false)
    expect(result.current.showPenalties).toBe(true)
  })

  it('shows not-drinking penalty when configured value is positive', () => {
    mockUseRallySettings.mockReturnValue({
      settings: { penalty_per_puke: 0, penalty_per_not_drinking: 2 },
    })
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, undefined))
    expect(result.current.showVomitPenalty).toBe(false)
    expect(result.current.showNotDrinkingPenalty).toBe(true)
    expect(result.current.showPenalties).toBe(true)
  })

  it('hides all penalties when both configured values are zero', () => {
    mockUseRallySettings.mockReturnValue({
      settings: { penalty_per_puke: 0, penalty_per_not_drinking: 0 },
    })
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, undefined))
    expect(result.current.showPenalties).toBe(false)
  })

  it('initializes extraShots and penalties from existingResult', () => {
    const existingResult = { extra_shots: 3, penalties: { vomit: 1 } } as never
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, existingResult))
    expect(result.current.extraShots).toBe(3)
    expect(result.current.penalties).toEqual({ vomit: 1 })
  })

  it('falls back to 0/{} when existingResult has falsy extra_shots and penalties', () => {
    const existingResult = { extra_shots: 0, penalties: undefined } as never
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, existingResult))
    expect(result.current.extraShots).toBe(0)
    expect(result.current.penalties).toEqual({})
  })

  it('does not initialize state when existingResult is undefined', () => {
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, undefined))
    expect(result.current.extraShots).toBe(0)
    expect(result.current.penalties).toEqual({})
  })

  it('allows setExtraShots and setPenalties to update state', () => {
    const { result } = renderHook(() => useExtraShotsAndPenalties(undefined, undefined))

    act(() => {
      result.current.setExtraShots(2)
      result.current.setPenalties({ vomit: 1 })
    })

    expect(result.current.extraShots).toBe(2)
    expect(result.current.penalties).toEqual({ vomit: 1 })
  })

  describe('validateExtraShots', () => {
    it('returns true and does not toast when within the limit', () => {
      const team = { id: 1, name: 'Team A', num_members: 2 } as unknown as Team
      const { result } = renderHook(() => useExtraShotsAndPenalties(team, undefined))

      act(() => {
        result.current.setExtraShots(3)
      })

      let valid = false
      act(() => {
        valid = result.current.validateExtraShots()
      })

      expect(valid).toBe(true)
      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('returns false and toasts an error when exceeding the limit', () => {
      const team = { id: 1, name: 'Team A', num_members: 1 } as unknown as Team
      const { result } = renderHook(() => useExtraShotsAndPenalties(team, undefined))

      act(() => {
        result.current.setExtraShots(999)
      })

      let valid = true
      act(() => {
        valid = result.current.validateExtraShots()
      })

      expect(valid).toBe(false)
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('Extra shots cannot exceed'),
      )
    })
  })
})

describe('getSubmitLabel', () => {
  it('returns "Saving..." while submitting', () => {
    expect(getSubmitLabel(true, false)).toBe('Saving...')
    expect(getSubmitLabel(true, true)).toBe('Saving...')
  })

  it('returns "Update Evaluation" when not submitting and has existing result', () => {
    expect(getSubmitLabel(false, true)).toBe('Update Evaluation')
  })

  it('returns "Submit Evaluation" when not submitting and no existing result', () => {
    expect(getSubmitLabel(false, false)).toBe('Submit Evaluation')
  })
})
