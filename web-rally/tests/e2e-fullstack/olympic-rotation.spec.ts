import { test, expect } from '@playwright/test';
import { mintToken, API_V1 } from './helpers/fullstackAuth';
import { waitForApi } from './helpers/seedRally';

/**
 * Gap this spec closes: olympic rotation-schedule generation is only
 * exercised in tests/e2e/olympic-rotation.spec.ts against a route-mocked
 * response — never against app/utils/round_robin.py's real
 * generate_schedule() or the real POST /events/{id}/rotation-schedule
 * endpoint (app/api/api_v1/events.py), which persists the schedule to
 * RallyEvent.rotation_schedule and 400s for non-olympic events.
 *
 * No browser is needed here — round_robin.py is a pure function and the
 * endpoint's correctness doesn't depend on the frontend at all, so this
 * asserts structural properties of the real response directly (each team
 * appears exactly once per round; every team ends up in the same checkpoint
 * at most once across the pairs it's scheduled into; N rounds for N teams /
 * K checkpoints). Team/checkpoint query order isn't guaranteed by an
 * explicit ORDER BY server-side, so this checks invariants the algorithm
 * guarantees rather than asserting one specific ordering.
 */

async function rawFetch(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${API_V1}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

interface RotationRound {
  team_id: number;
  checkpoint_id: number;
}

test.describe('Olympic rotation schedule against the real backend', () => {
  test.setTimeout(60_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('generates a balanced schedule covering every team-checkpoint pair with no team double-booked in a round', async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-olympic-admin-${runId}`,
      name: 'E2E Olympic Admin',
      groups: ['admin'],
      email: `e2e-olympic-admin-${runId}@ua.pt`,
    });

    const event = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: `E2E Olímpico ${runId}`, slug: `e2e-olimpico-${runId}`, event_type: 'olympic' },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${event.id}/set-current`, { token: admin.accessToken });

    const teamCount = 3;
    const checkpointCount = 4;
    const teamIds: number[] = [];
    for (let i = 0; i < teamCount; i++) {
      const team = await rawFetch('POST', '/team/', {
        token: admin.accessToken,
        body: { name: `E2E Olympic Team ${runId}-${i}` },
      }).then((r) => r.json() as Promise<{ id: number }>);
      teamIds.push(team.id);
    }
    const checkpointIds: number[] = [];
    for (let i = 0; i < checkpointCount; i++) {
      const checkpoint = await rawFetch('POST', '/checkpoint/', {
        token: admin.accessToken,
        body: { name: `E2E Olympic Checkpoint ${runId}-${i}`, order: i + 1, arrival_radius_m: 9999 },
      }).then((r) => r.json() as Promise<{ id: number }>);
      checkpointIds.push(checkpoint.id);
    }

    const response = await rawFetch('POST', `/events/${event.id}/rotation-schedule`, {
      token: admin.accessToken,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { event_id: number; rounds: RotationRound[][] };
    expect(body.event_id).toBe(event.id);

    // round_robin.py: n_rounds = max(n_teams, n_checkpoints).
    expect(body.rounds).toHaveLength(Math.max(teamCount, checkpointCount));

    const teamIdSet = new Set(teamIds);
    const checkpointIdSet = new Set(checkpointIds);
    const pairsSeen = new Set<string>();
    for (const round of body.rounds) {
      // Every team appears exactly once per round — no double-booking.
      expect(round).toHaveLength(teamCount);
      const teamsInRound = new Set(round.map((r) => r.team_id));
      expect(teamsInRound.size).toBe(teamCount);
      for (const { team_id, checkpoint_id } of round) {
        expect(teamIdSet.has(team_id)).toBe(true);
        expect(checkpointIdSet.has(checkpoint_id)).toBe(true);
        pairsSeen.add(`${team_id}:${checkpoint_id}`);
      }
    }
    // Over the full schedule, every (team, checkpoint) pair is covered at
    // least once — the whole point of a rotation schedule.
    for (const teamId of teamIds) {
      for (const checkpointId of checkpointIds) {
        expect(pairsSeen.has(`${teamId}:${checkpointId}`)).toBe(true);
      }
    }

    // RallyEventResponse doesn't expose rotation_schedule, so persistence
    // (events.py commits it to RallyEvent.rotation_schedule) can't be
    // confirmed by re-reading the event through the public API — only that
    // regenerating produces a structurally equivalent schedule again.
    const regenerateResponse = await rawFetch('POST', `/events/${event.id}/rotation-schedule`, {
      token: admin.accessToken,
    });
    expect(regenerateResponse.status).toBe(200);
    const regenerated = (await regenerateResponse.json()) as { rounds: RotationRound[][] };
    expect(regenerated.rounds).toHaveLength(body.rounds.length);
  });

  test('is rejected for a non-olympic event', async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-olympic-admin2-${runId}`,
      name: 'E2E Olympic Admin Two',
      groups: ['admin'],
      email: `e2e-olympic-admin2-${runId}@ua.pt`,
    });
    const event = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: {
        name: `E2E Não-Olímpico ${runId}`,
        slug: `e2e-nao-olimpico-${runId}`,
        event_type: 'rally_tascas',
      },
    }).then((r) => r.json() as Promise<{ id: number }>);

    const response = await rawFetch('POST', `/events/${event.id}/rotation-schedule`, {
      token: admin.accessToken,
    });
    expect(response.status).toBe(400);
  });

  test('is rejected when the event has no teams or checkpoints yet', async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-olympic-admin3-${runId}`,
      name: 'E2E Olympic Admin Three',
      groups: ['admin'],
      email: `e2e-olympic-admin3-${runId}@ua.pt`,
    });
    const event = await rawFetch('POST', '/events', {
      token: admin.accessToken,
      body: { name: `E2E Olímpico Vazio ${runId}`, slug: `e2e-olimpico-vazio-${runId}`, event_type: 'olympic' },
    }).then((r) => r.json() as Promise<{ id: number }>);
    await rawFetch('POST', `/events/${event.id}/set-current`, { token: admin.accessToken });

    const response = await rawFetch('POST', `/events/${event.id}/rotation-schedule`, {
      token: admin.accessToken,
    });
    expect(response.status).toBe(400);
  });
});
