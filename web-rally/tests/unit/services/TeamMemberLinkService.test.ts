/**
 * Test suite for TeamMemberLinkService.ts — linking a placeholder team member
 * to a real NEI (OIDC) account, admin or self-serve.
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

describe('TeamMemberLinkService', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('searchOidcUsers queries NEI accounts by name or email', async () => {
    const results = [{ name: 'Jane', authentik_sub: 'sub-1' }]
    getMock.mockResolvedValue({ data: results })
    const { TeamMemberLinkService } = await import('@/services/TeamMemberLinkService')

    const result = await TeamMemberLinkService.searchOidcUsers('jane')

    expect(result).toEqual(results)
    expect(getMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/user/search',
      query: { q: 'jane' },
    })
  })

  it('linkMember links a placeholder member to a chosen account', async () => {
    const linked = { id: 5, name: 'Jane', is_captain: false }
    postMock.mockResolvedValue({ data: linked })
    const { TeamMemberLinkService } = await import('@/services/TeamMemberLinkService')

    const result = await TeamMemberLinkService.linkMember(1, 2, {
      authentik_sub: 'sub-1',
      name: 'Jane',
      email: 'jane@example.com',
    })

    expect(result).toEqual(linked)
    expect(postMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/team/{team_id}/members/{user_id}/link',
      path: { team_id: 1, user_id: 2 },
      body: {
        authentik_sub: 'sub-1',
        name: 'Jane',
        email: 'jane@example.com',
      },
    })
  })

  it('linkMember defaults email to null when not provided', async () => {
    postMock.mockResolvedValue({ data: {} })
    const { TeamMemberLinkService } = await import('@/services/TeamMemberLinkService')

    await TeamMemberLinkService.linkMember(1, 2, {
      authentik_sub: 'sub-1',
      name: 'Jane',
    })

    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ email: null }),
      }),
    )
  })

  it('linkSelf sends the team access code that proves membership', async () => {
    const linked = { id: 5, name: 'Jane', is_captain: true }
    postMock.mockResolvedValue({ data: linked })
    const { TeamMemberLinkService } = await import('@/services/TeamMemberLinkService')

    const result = await TeamMemberLinkService.linkSelf(1, 2, 'CODE99')

    expect(result).toEqual(linked)
    expect(postMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/team/{team_id}/members/{user_id}/link-self',
      path: { team_id: 1, user_id: 2 },
      body: { access_code: 'CODE99' },
    })
  })
})
