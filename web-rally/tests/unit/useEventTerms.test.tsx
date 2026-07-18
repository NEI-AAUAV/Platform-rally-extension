import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({ useRallySettings: vi.fn() }))

vi.mock('@/hooks/useRallySettings', () => ({ default: h.useRallySettings }))

import useEventTerms from '@/hooks/useEventTerms'
import { getEventTerms } from '@/lib/eventTerms'

describe('useEventTerms', () => {
  it('resolves terms from the current settings event_type', () => {
    h.useRallySettings.mockReturnValue({ settings: { event_type: 'classic' } })
    const { result } = renderHook(() => useEventTerms())
    expect(result.current).toEqual(getEventTerms('classic'))
  })

  it('falls back to defaults when settings are not loaded yet', () => {
    h.useRallySettings.mockReturnValue({ settings: undefined })
    const { result } = renderHook(() => useEventTerms())
    expect(result.current).toEqual(getEventTerms(undefined))
  })
})
