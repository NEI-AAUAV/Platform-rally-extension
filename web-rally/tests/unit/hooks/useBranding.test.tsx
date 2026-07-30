import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({ useRallySettings: vi.fn() }))

vi.mock('@/hooks/useRallySettings', () => ({ default: h.useRallySettings }))

import useBranding from '@/hooks/useBranding'

describe('useBranding', () => {
  it('resolves branding from settings and forwards isLoading', () => {
    h.useRallySettings.mockReturnValue({
      settings: { event_name: 'Rally X' },
      isLoading: false,
    })

    const { result } = renderHook(() => useBranding())

    expect(result.current.branding.eventName).toBe('Rally X')
    expect(result.current.isLoading).toBe(false)
  })

  it('falls back to bundled defaults while loading with no settings', () => {
    h.useRallySettings.mockReturnValue({ settings: undefined, isLoading: true })

    const { result } = renderHook(() => useBranding())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.branding.eventName).toBeTruthy()
  })
})
