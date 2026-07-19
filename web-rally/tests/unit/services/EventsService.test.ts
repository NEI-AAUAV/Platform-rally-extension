/**
 * Test suite for EventsService.ts — rally event (edition) management.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()
const putMock = vi.fn()

vi.mock('@/client/client.gen', () => ({
  client: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
  },
}))

describe('EventsService', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    putMock.mockReset()
  })

  it('listEvents fetches all events', async () => {
    const events = [{ id: 1, name: 'Rally 2026' }]
    getMock.mockResolvedValue({ data: events })
    const { EventsService } = await import('@/services/EventsService')

    const result = await EventsService.listEvents()

    expect(result).toEqual(events)
    expect(getMock).toHaveBeenCalledWith({ url: '/api/rally/v1/events' })
  })

  it('getCurrentEvent fetches the active event', async () => {
    const event = { id: 1, name: 'Rally 2026' }
    getMock.mockResolvedValue({ data: event })
    const { EventsService } = await import('@/services/EventsService')

    const result = await EventsService.getCurrentEvent()

    expect(result).toEqual(event)
    expect(getMock).toHaveBeenCalledWith({ url: '/api/rally/v1/events/current' })
  })

  it('createEvent posts the new event body', async () => {
    const body = { name: 'Rally 2027' } as never
    const created = { id: 2, name: 'Rally 2027' }
    postMock.mockResolvedValue({ data: created })
    const { EventsService } = await import('@/services/EventsService')

    const result = await EventsService.createEvent(body)

    expect(result).toEqual(created)
    expect(postMock).toHaveBeenCalledWith({ url: '/api/rally/v1/events', body })
  })

  it('updateEvent puts the update body for the given event id', async () => {
    const body = { name: 'Updated Name' } as never
    const updated = { id: 3, name: 'Updated Name' }
    putMock.mockResolvedValue({ data: updated })
    const { EventsService } = await import('@/services/EventsService')

    const result = await EventsService.updateEvent(3, body)

    expect(result).toEqual(updated)
    expect(putMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/events/{event_id}',
      path: { event_id: 3 },
      body,
    })
  })

  it('setCurrentEvent posts to mark the event as current', async () => {
    const event = { id: 4, name: 'Rally 2028' }
    postMock.mockResolvedValue({ data: event })
    const { EventsService } = await import('@/services/EventsService')

    const result = await EventsService.setCurrentEvent(4)

    expect(result).toEqual(event)
    expect(postMock).toHaveBeenCalledWith({
      url: '/api/rally/v1/events/{event_id}/set-current',
      path: { event_id: 4 },
    })
  })
})
