/**
 * Test suite for CheckinService.ts — team QR self-check-in and staff check-in.
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

describe('CheckinService', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  describe('getCheckinToken', () => {
    it('requests a token without a checkpoint id', async () => {
      getMock.mockResolvedValue({ data: { token: 'abc' } })
      const { CheckinService } = await import('@/services/CheckinService')

      const result = await CheckinService.getCheckinToken()

      expect(result).toEqual({ token: 'abc' })
      expect(getMock).toHaveBeenCalledWith({
        url: '/api/rally/v1/checkpoint/checkin-token',
        query: undefined,
      })
    })

    it('requests a token scoped to a given checkpoint id', async () => {
      getMock.mockResolvedValue({ data: { token: 'xyz' } })
      const { CheckinService } = await import('@/services/CheckinService')

      const result = await CheckinService.getCheckinToken(5)

      expect(result).toEqual({ token: 'xyz' })
      expect(getMock).toHaveBeenCalledWith({
        url: '/api/rally/v1/checkpoint/checkin-token',
        query: { checkpoint_id: 5 },
      })
    })
  })

  describe('staffCheckIn', () => {
    it('checks a team in by access code with an explicit checkpoint id', async () => {
      const response = {
        team_id: 1,
        team_name: 'Team A',
        checkpoint_id: 3,
        checkpoint_order: 2,
        status: 'checked_in',
      }
      postMock.mockResolvedValue({ data: response })
      const { CheckinService } = await import('@/services/CheckinService')

      const result = await CheckinService.staffCheckIn('CODE123', 3)

      expect(result).toEqual(response)
      expect(postMock).toHaveBeenCalledWith({
        url: '/api/rally/v1/checkpoint/staff-check-in',
        body: { team_code: 'CODE123', checkpoint_id: 3 },
      })
    })

    it('defaults checkpoint id to null when not provided', async () => {
      postMock.mockResolvedValue({ data: {} })
      const { CheckinService } = await import('@/services/CheckinService')

      await CheckinService.staffCheckIn('CODE123')

      expect(postMock).toHaveBeenCalledWith({
        url: '/api/rally/v1/checkpoint/staff-check-in',
        body: { team_code: 'CODE123', checkpoint_id: null },
      })
    })
  })

  describe('checkIn', () => {
    it('checks into the checkpoint encoded in a scanned token', async () => {
      const response = { team_id: 1, checkpoint_id: 2, checkpoint_order: 1 }
      postMock.mockResolvedValue({ data: response })
      const { CheckinService } = await import('@/services/CheckinService')

      const result = await CheckinService.checkIn('scanned-token')

      expect(result).toEqual(response)
      expect(postMock).toHaveBeenCalledWith({
        url: '/api/rally/v1/checkpoint/check-in',
        body: { token: 'scanned-token' },
      })
    })
  })
})
