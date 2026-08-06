import { describe, it, expect } from 'vitest'
import { isNavItemActive } from '@/components/shared/navigation/activeRoute'

describe('isNavItemActive', () => {
  it('matches "/" only on an exact pathname', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/team-progress', '/')).toBe(false)
    expect(isNavItemActive('/team-info', '/')).toBe(false)
  })

  it('matches a plain href exactly', () => {
    expect(isNavItemActive('/team-progress', '/team-progress')).toBe(true)
    expect(isNavItemActive('/scoreboard', '/team-progress')).toBe(false)
  })

  it('matches nested routes by segment prefix', () => {
    expect(
      isNavItemActive('/staff-evaluation/checkpoint/1', '/staff-evaluation'),
    ).toBe(true)
    // Not a shared segment — "/staff-evaluation-extra" must not light "/staff-evaluation".
    expect(isNavItemActive('/staff-evaluation-extra', '/staff-evaluation')).toBe(false)
  })

  it('matches any provided alias', () => {
    expect(isNavItemActive('/', '/team-progress', ['/'])).toBe(true)
    expect(isNavItemActive('/checkpoints', '/team-progress', ['/'])).toBe(false)
  })
})
