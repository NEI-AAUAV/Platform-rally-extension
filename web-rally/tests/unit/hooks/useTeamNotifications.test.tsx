import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { DetailedTeam } from '@/client'

const h = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => h,
}))

import useTeamNotifications from '@/hooks/useTeamNotifications'

function makeTeam(over: Partial<DetailedTeam>): DetailedTeam {
  return { classification: 1, last_checkpoint_number: 0, ...over } as DetailedTeam
}

describe('useTeamNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when team is undefined', () => {
    renderHook(() => useTeamNotifications(undefined))
    expect(h.success).not.toHaveBeenCalled()
    expect(h.info).not.toHaveBeenCalled()
  })

  it('does not announce on the first observation (seeds the baseline)', () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, last_checkpoint_number: 1 }) },
    })
    expect(h.success).not.toHaveBeenCalled()
    expect(h.info).not.toHaveBeenCalled()
    rerender({ team: makeTeam({ classification: 3, last_checkpoint_number: 1 }) })
    expect(h.success).not.toHaveBeenCalled()
  })

  it('announces when checkpoint advances', () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, last_checkpoint_number: 1 }) },
    })
    rerender({ team: makeTeam({ classification: 3, last_checkpoint_number: 2 }) })
    expect(h.success).toHaveBeenCalledWith('Chegaste ao posto 2!')
  })

  it('announces when rank improves (lower number)', () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 5, last_checkpoint_number: 1 }) },
    })
    rerender({ team: makeTeam({ classification: 3, last_checkpoint_number: 1 }) })
    expect(h.info).toHaveBeenCalledWith('Subiste para 3º lugar!')
  })

  it('does not announce a climb from the unranked sentinel (-1)', () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: -1, last_checkpoint_number: 1 }) },
    })
    rerender({ team: makeTeam({ classification: 2, last_checkpoint_number: 1 }) })
    expect(h.info).not.toHaveBeenCalled()
  })

  it('does not announce when rank worsens', () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 2, last_checkpoint_number: 1 }) },
    })
    rerender({ team: makeTeam({ classification: 4, last_checkpoint_number: 1 }) })
    expect(h.info).not.toHaveBeenCalled()
  })

  it('does not announce a climb when the new rank becomes the unranked sentinel', () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, last_checkpoint_number: 1 }) },
    })
    rerender({ team: makeTeam({ classification: -1, last_checkpoint_number: 1 }) })
    expect(h.info).not.toHaveBeenCalled()
  })

  it('treats a missing last_checkpoint_number as 0', () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: {
        team: makeTeam({ classification: 3, last_checkpoint_number: undefined }),
      },
    })
    rerender({ team: makeTeam({ classification: 3, last_checkpoint_number: 1 }) })
    expect(h.success).toHaveBeenCalledWith('Chegaste ao posto 1!')
  })
})
