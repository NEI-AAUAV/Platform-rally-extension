import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";

/**
 * Fixture for the peddy-paper game loop against the real backend.
 *
 * Unlike seedRally(), this creates the event with `event_type: peddy_paper`,
 * which is what makes api-rally bootstrap the mode's settings
 * (`reveal_next_checkpoint: false`, `gps_checkin_enabled: true`,
 * `hint_penalty: -10`, `participant_view_enabled: true` — see
 * crud_rally_settings.get_or_create). The spec then asserts those defaults
 * rather than setting them, so a regression in the bootstrap is caught here
 * instead of being papered over by the fixture.
 *
 * Checkpoints get real coordinates and a small radius so a Playwright
 * `setGeolocation` can land inside the geofence, plus a clue — the riddle the
 * team receives *instead of* the location.
 */

export interface SeededPeddyCheckpoint {
  readonly id: number;
  readonly order: number;
  readonly name: string;
  readonly clue: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface SeededPeddyPaper {
  readonly admin: MintedUser;
  readonly runId: string;
  readonly eventId: number;
  readonly checkpoints: readonly SeededPeddyCheckpoint[];
  readonly hints: readonly string[];
  readonly expectedAnswer: string;
  readonly teamId: number;
  readonly teamName: string;
  readonly accessCode: string;
}

/** Far from any other spec's fixtures, and precise enough to geofence. */
const BASE_LATITUDE = 40.6405;
const BASE_LONGITUDE = -8.6538;
const ARRIVAL_RADIUS_M = 50;

export async function seedPeddyPaper(): Promise<SeededPeddyPaper> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const adminSub = `e2e-peddy-admin-${runId}`;
  const adminEmail = `${adminSub}@ua.pt`;
  const admin = await mintToken({
    sub: adminSub,
    name: "E2E Peddy Admin",
    groups: ["admin"],
    email: adminEmail,
  });

  // A fresh event per call so this fixture's checkpoints genuinely start at
  // order 1 — see seedRally.ts's createAndActivateEvent for why that matters.
  // Here it must also carry event_type so the peddy-paper settings bootstrap.
  const event = await apiCall<{ id: number }>("POST", "/events", {
    token: admin.accessToken,
    body: {
      name: `E2E Peddy Paper ${runId}`,
      slug: `e2e-peddy-${runId}`,
      event_type: "peddy_paper",
    },
  });
  await apiCall("POST", `/events/${event.id}/set-current`, { token: admin.accessToken });

  const specs = [
    {
      order: 1,
      name: `Ponte de Ferro ${runId}`,
      clue: "Onde o rio encontra a ponte de ferro.",
      latitude: BASE_LATITUDE,
      longitude: BASE_LONGITUDE,
    },
    {
      order: 2,
      name: `Mercado Velho ${runId}`,
      clue: "Debaixo do relógio que já não dá horas.",
      // ~1.1 km away: far enough that the first checkpoint's geolocation is
      // firmly outside this one's geofence.
      latitude: BASE_LATITUDE + 0.01,
      longitude: BASE_LONGITUDE,
    },
  ] as const;

  const checkpoints: SeededPeddyCheckpoint[] = [];
  for (const spec of specs) {
    const created = await apiCall<{ id: number }>("POST", "/checkpoint/", {
      token: admin.accessToken,
      body: {
        name: spec.name,
        order: spec.order,
        latitude: spec.latitude,
        longitude: spec.longitude,
        arrival_radius_m: ARRIVAL_RADIUS_M,
        clue: spec.clue,
      },
    });
    checkpoints.push({ ...spec, id: created.id });
  }

  // The hint ladder for checkpoint 1, vaguest first. expected_answer is
  // guide-only — the spec asserts it never reaches the team.
  const hints = ["Segue o rio para norte.", "Procura a placa azul junto ao cais."] as const;
  const expectedAnswer = `RESPOSTA-SECRETA-${runId}`;
  for (const [index, hint] of hints.entries()) {
    await apiCall("POST", `/checkpoint/${checkpoints[0]!.id}/guide-indications`, {
      token: admin.accessToken,
      body: {
        hint,
        question: "Em que ano foi construída?",
        expected_answer: expectedAnswer,
        order: index,
      },
    });
  }

  // Team count accumulates across spec files sharing one disposable Postgres,
  // so raise the cap rather than assuming headroom (same fix as seedRally).
  const settings = await apiCall<{ max_teams: number } & Record<string, unknown>>(
    "GET",
    "/rally/settings",
    { token: admin.accessToken },
  );
  const existingTeams = await apiCall<unknown[]>("GET", "/team/", { token: admin.accessToken });
  if (settings.max_teams < existingTeams.length + 5) {
    await apiCall("PUT", "/rally/settings", {
      token: admin.accessToken,
      body: { ...settings, max_teams: existingTeams.length + 5 },
    });
  }

  const teamName = `E2E Peddy Team ${runId}`;
  const team = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
    token: admin.accessToken,
    body: { name: teamName },
  });

  return {
    admin,
    runId,
    eventId: event.id,
    checkpoints,
    hints,
    expectedAnswer,
    teamId: team.id,
    teamName,
    accessCode: team.access_code,
  };
}

/** Log a team in through the real API and return its JWT. */
export async function loginTeam(accessCode: string): Promise<string> {
  const { access_token } = await apiCall<{ access_token: string }>("POST", "/team-auth/login", {
    body: { access_code: accessCode },
  });
  return access_token;
}
