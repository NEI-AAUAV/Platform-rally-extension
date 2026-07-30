/**
 * Test suite for ProfileService.ts — the caller's rally profile and
 * participation history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('@/client/client.gen', () => ({
  client: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}))

describe('ProfileService', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('getMyProfile fetches the current user profile', async () => {
    const profile = { user_id: 1, name: 'Jane' }
    getMock.mockResolvedValue({ data: profile })
    const { ProfileService } = await import('@/services/ProfileService')

    const result = await ProfileService.getMyProfile()

    expect(result).toEqual(profile)
    expect(getMock).toHaveBeenCalledWith({ url: '/api/rally/v1/profile/me' })
  })

  it('getMyHistory fetches past participations', async () => {
    const history = [{ event_id: 1, team_id: 2 }]
    getMock.mockResolvedValue({ data: history })
    const { ProfileService } = await import('@/services/ProfileService')

    const result = await ProfileService.getMyHistory()

    expect(result).toEqual(history)
    expect(getMock).toHaveBeenCalledWith({ url: '/api/rally/v1/profile/history' })
  })

  it('getClaimable fetches name-only members by access code', async () => {
    const claimable = { team_id: 3, members: [] }
    getMock.mockResolvedValue({ data: claimable })
    const { ProfileService } = await import('@/services/ProfileService')

    const result = await ProfileService.getClaimable('CODE99')

    expect(result).toEqual(claimable)
    expect(getMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/profile/claimable',
      query: { access_code: 'CODE99' },
    })
  })

  it('claimMembership posts to claim a name-only member', async () => {
    const entry = { event_id: 1, team_id: 2 }
    postMock.mockResolvedValue({ data: entry })
    const { ProfileService } = await import('@/services/ProfileService')

    const result = await ProfileService.claimMembership(42, 'CODE99')

    expect(result).toEqual(entry)
    expect(postMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/profile/claim/{member_user_id}',
      path: { member_user_id: 42 },
      body: { access_code: 'CODE99' },
    })
  })
})
