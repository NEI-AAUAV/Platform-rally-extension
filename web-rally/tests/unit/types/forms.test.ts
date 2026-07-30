/**
 * Test suite for forms.ts — getTeamSize helper that reads team size from
 * either a ListingTeam (num_members) or a DetailedTeam (members array).
 */
import { describe, it, expect } from 'vitest'
import { getTeamSize } from '@/types/forms'
import type { Team } from '@/types/forms'

describe('getTeamSize', () => {
  it('returns 1 when no team is provided', () => {
    expect(getTeamSize(undefined)).toBe(1)
  })

  it('returns num_members for a ListingTeam', () => {
    const team = { num_members: 4 } as unknown as Team
    expect(getTeamSize(team)).toBe(4)
  })

  it('returns members.length for a DetailedTeam', () => {
    const team = { members: [{ id: 1 }, { id: 2 }, { id: 3 }] } as unknown as Team
    expect(getTeamSize(team)).toBe(3)
  })

  it('returns 1 when neither num_members nor members is present', () => {
    const team = {} as unknown as Team
    expect(getTeamSize(team)).toBe(1)
  })
})
