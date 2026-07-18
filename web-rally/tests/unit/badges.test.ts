import { describe, it, expect } from 'vitest'
import { getBadgeDisplay, BADGE_FALLBACK } from '@/lib/badges'
import type { BadgeDefinitionLite } from '@/client'

const make = (over: Partial<BadgeDefinitionLite>): BadgeDefinitionLite =>
  ({
    name: 'Best Team',
    description: '',
    color: '',
    glyph: '',
    icon_url: null,
    ...over,
  }) as BadgeDefinitionLite

describe('getBadgeDisplay', () => {
  it('uses the provided values when all fields are set', () => {
    const display = getBadgeDisplay(
      make({
        name: 'Champion',
        description: 'Won the whole thing',
        color: '#ff0000',
        glyph: '★',
        icon_url: 'https://example.com/icon.png',
      }),
    )

    expect(display).toEqual({
      label: 'Champion',
      description: 'Won the whole thing',
      color: '#ff0000',
      glyph: '★',
      iconUrl: 'https://example.com/icon.png',
    })
  })

  it('falls back to bundled description, color and glyph when unset', () => {
    const display = getBadgeDisplay(
      make({ description: '', color: '', glyph: '', icon_url: null }),
    )

    expect(display.description).toBe(BADGE_FALLBACK.description)
    expect(display.color).toBe(BADGE_FALLBACK.color)
    expect(display.glyph).toBe(BADGE_FALLBACK.glyph)
    expect(display.iconUrl).toBeNull()
  })

  it('treats a missing icon_url as null', () => {
    const display = getBadgeDisplay(make({ icon_url: undefined }))
    expect(display.iconUrl).toBeNull()
  })

  it('always passes through the badge name as the label', () => {
    const display = getBadgeDisplay(make({ name: 'Speedster' }))
    expect(display.label).toBe('Speedster')
  })
})
