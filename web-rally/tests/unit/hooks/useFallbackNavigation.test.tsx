import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({ useRallySettings: vi.fn() }))

vi.mock('@/hooks/useRallySettings', () => ({ default: h.useRallySettings }))

import useFallbackNavigation from '@/hooks/useFallbackNavigation'

describe('useFallbackNavigation', () => {
  it('returns /checkpoints when score mode is hidden', () => {
    h.useRallySettings.mockReturnValue({ settings: { show_score_mode: 'hidden' } })
    const { result } = renderHook(() => useFallbackNavigation())
    expect(result.current).toBe('/checkpoints')
  })

  it('returns /scoreboard otherwise', () => {
    h.useRallySettings.mockReturnValue({ settings: { show_score_mode: 'visible' } })
    const { result } = renderHook(() => useFallbackNavigation())
    expect(result.current).toBe('/scoreboard')
  })

  it('returns /scoreboard when settings are undefined', () => {
    h.useRallySettings.mockReturnValue({ settings: undefined })
    const { result } = renderHook(() => useFallbackNavigation())
    expect(result.current).toBe('/scoreboard')
  })
})
