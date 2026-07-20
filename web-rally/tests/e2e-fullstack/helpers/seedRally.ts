import { mintToken, apiCall, type MintedUser } from './fullstackAuth';

export interface SeededRally {
  readonly admin: MintedUser;
  readonly checkpointId: number;
  readonly checkpointOrder: number;
  readonly activityId: number;
  readonly teamId: number;
  readonly accessCode: string;
}

/**
 * Minimal deterministic fixture: one admin, one checkpoint, one boolean
 * activity, one team. Mirrors api-rally/scripts/smoke/run_smoke.py's setup
 * step so the same real-backend contract is exercised. Each call creates
 * fresh rows (no cleanup — the smoke Postgres is disposable per CI run).
 */
export async function seedRally(): Promise<SeededRally> {
  // A Date.now()-only suffix collides across fast sequential retries (same
  // millisecond), which reuses the same admin `sub` / checkpoint `order` and
  // corrupts state between retry attempts. Add a random component.
  const uniqueId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const admin = await mintToken({ sub: `e2e-admin-${uniqueId}`, name: 'E2E Admin', groups: ['admin'] });

  // `order` must be unique per checkpoint; each call needs its own so
  // concurrent/repeated seeding within a test run doesn't collide.
  const order = Math.floor(Math.random() * 100_000) + 1;
  const checkpoint = await apiCall<{ id: number }>('POST', '/checkpoint/', {
    token: admin.accessToken,
    body: { name: `E2E Checkpoint ${order}`, order, arrival_radius_m: 50 },
  });

  const activity = await apiCall<{ id: number }>('POST', '/activities/', {
    token: admin.accessToken,
    body: {
      name: 'E2E Activity',
      activity_type: 'BooleanActivity',
      checkpoint_id: checkpoint.id,
      config: {},
      is_active: true,
    },
  });

  const team = await apiCall<{ id: number; access_code: string }>('POST', '/team/', {
    token: admin.accessToken,
    body: { name: `E2E Team ${order}` },
  });

  // The fake-oidc smoke stack starts with participant_view_enabled: false
  // (and other conservative defaults); flip on what the golden-path scenario
  // needs to see the team's own progress view render.
  const currentSettings = await apiCall<Record<string, unknown>>('GET', '/rally/settings', {
    token: admin.accessToken,
  });
  await apiCall('PUT', '/rally/settings', {
    token: admin.accessToken,
    body: { ...currentSettings, participant_view_enabled: true, show_score_mode: 'competitive' },
  });

  return {
    admin,
    checkpointId: checkpoint.id,
    checkpointOrder: order,
    activityId: activity.id,
    teamId: team.id,
    accessCode: team.access_code,
  };
}

/** Polls the API's OpenAPI docs endpoint until the backend is ready. */
export async function waitForApi(timeoutMs = 60_000): Promise<void> {
  const apiBaseUrl = process.env.FULLSTACK_API_BASE_URL ?? 'http://localhost:8103';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/docs`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('api-rally did not become ready in time');
}
