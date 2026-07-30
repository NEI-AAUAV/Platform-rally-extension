/**
 * Test suite for BadgeService.ts — hand-written badge read endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMock = vi.fn()

vi.mock('@/client/client.gen', () => ({
  client: {
    get: (...args: unknown[]) => getMock(...args),
  },
}))

describe('BadgeService', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('listAllBadges fetches all badges', async () => {
    const badges = [{ id: 1, name: 'Speedster' }]
    getMock.mockResolvedValue({ data: badges })

    const { BadgeService } = await import('@/services/BadgeService')
    const result = await BadgeService.listAllBadges()

    expect(result).toEqual(badges)
    expect(getMock).toHaveBeenCalledWith({ url: '/api/rally/v1/badges' })
  })

  it('listTeamBadges fetches badges scoped to a team', async () => {
    const badges = [{ id: 2, name: 'Team Player' }]
    getMock.mockResolvedValue({ data: badges })

    const { BadgeService } = await import('@/services/BadgeService')
    const result = await BadgeService.listTeamBadges(7)

    expect(result).toEqual(badges)
    expect(getMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/teams/{team_id}/badges',
      path: { team_id: 7 },
    })
  })
})
