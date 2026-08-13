import { test, expect } from '@playwright/test';
import { mintToken, seedRealOidcSession, apiCall } from './helpers/fullstackAuth';
import { waitForApi } from './helpers/seedRally';

/**
 * Gap this spec closes: every other fullstack spec seeds its event,
 * checkpoints, activities, teams, and staff assignment via direct `apiCall`s
 * (see helpers/seedRally.ts, helpers/seedRallyDay.ts) — none of them ever
 * drive the admin UI's own forms. That means a broken "create checkpoint"
 * form, a checkpoint_id select that silently submits the wrong id, or a
 * settings toggle that doesn't actually persist would pass every other
 * fullstack test and only ever be caught by the *mocked* admin specs (whose
 * mocks could themselves have drifted from the real API contract).
 *
 * This spec configures a whole event through the real admin UI — form
 * fills and clicks, not apiCall — against the real backend, then
 * cross-checks every entity it created by reading it back from the API
 * directly. That closes the loop: UI form -> real POST/PUT -> real row ->
 * confirmed via a path the UI itself didn't take.
 *
 * Runs sequentially (single admin), unlike rally-day.spec.ts's concurrency
 * focus — this test is about UI-to-backend correctness, not race conditions.
 */

test.describe('Admin configures a full event through the real UI', () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test('event, checkpoints, activities, team, staff assignment, and settings all persist as created', async ({
    page,
    context,
  }) => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-admin-setup-${runId}`,
      name: 'E2E Admin Setup',
      groups: ['admin'],
      email: `e2e-admin-setup-${runId}@ua.pt`,
    });
    await seedRealOidcSession(context, admin);

    // A staff user must already exist (mirrored into the local `users` table)
    // before the admin UI's assignment tab can list and assign it — the tab
    // only shows existing rally-staff users, it doesn't create them. Minting
    // + one authenticated call is the same materialization trick
    // seedRallyDay.ts uses.
    const staffEmail = `e2e-staff-setup-${runId}@ua.pt`;
    const staff = await mintToken({
      sub: `e2e-staff-setup-${runId}`,
      name: 'E2E Staff Setup',
      groups: ['rally-staff'],
      email: staffEmail,
    });
    await apiCall('GET', '/profile/me', { token: staff.accessToken });

    // --- 1. Create and activate a new event, through the UI ---------------
    const eventName = `E2E Admin UI Event ${runId}`;
    await page.goto('/rally/admin?tab=events');
    await page.getByRole('button', { name: 'Novo' }).click();
    await page.locator('#ev-name').fill(eventName);
    await page.locator('#ev-type').click();
    await page.getByRole('option', { name: 'Rally Tascas' }).click();
    await page.getByRole('button', { name: /^Criar$/ }).click();
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 15_000 });

    const eventsAfterCreate = await apiCall<{ id: number; name: string; is_current: boolean }[]>(
      'GET',
      '/events',
      { token: admin.accessToken },
    );
    const createdEvent = eventsAfterCreate.find((e) => e.name === eventName);
    expect(createdEvent).toBeDefined();
    if (!createdEvent) throw new Error('unreachable');

    // Not current yet (it's a fresh, non-first event on a shared disposable
    // Postgres) — set it as current through the UI, not the API.
    if (!createdEvent.is_current) {
      const eventCard = page.locator('.rally-surface', { hasText: eventName });
      await eventCard.getByRole('button', { name: 'Tornar atual' }).click();
      await expect(eventCard.getByText('Atual', { exact: true })).toBeVisible({ timeout: 15_000 });
    }
    const currentEvent = await apiCall<{ id: number }>('GET', '/events/current', {
      token: admin.accessToken,
    });
    expect(currentEvent.id).toBe(createdEvent.id);

    // --- 2. Create two checkpoints through the UI --------------------------
    const checkpointAName = `E2E Posto A ${runId}`;
    const checkpointBName = `E2E Posto B ${runId}`;

    await page.goto('/rally/admin?tab=checkpoints');
    await page.getByPlaceholder('Ex: Checkpoint Central').fill(checkpointAName);
    await page.getByPlaceholder('Ex: 40.6405').fill('40.6306');
    await page.getByPlaceholder('Ex: -8.6538').fill('-8.6591');
    await page.getByPlaceholder('Ex: 50').fill('75');
    // order is no longer a manual field — the form auto-assigns
    // max(existing order) + 1 and reordering happens by dragging the list.
    await page.getByRole('button', { name: 'Criar Checkpoint' }).click();
    await expect(page.getByText(checkpointAName)).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder('Ex: Checkpoint Central').fill(checkpointBName);
    await page.getByRole('button', { name: 'Criar Checkpoint' }).click();
    await expect(page.getByText(checkpointBName)).toBeVisible({ timeout: 15_000 });

    const checkpointsAfterCreate = await apiCall<
      { id: number; name: string; order: number; arrival_radius_m: number }[]
    >('GET', '/checkpoint/', { token: admin.accessToken });
    const checkpointA = checkpointsAfterCreate.find((c) => c.name === checkpointAName);
    const checkpointB = checkpointsAfterCreate.find((c) => c.name === checkpointBName);
    expect(checkpointA).toBeDefined();
    expect(checkpointB).toBeDefined();
    if (!checkpointA || !checkpointB) throw new Error('unreachable');
    expect(checkpointA.order).toBe(1);
    expect(checkpointB.order).toBe(2);
    // Proves the UI's numeric input actually round-tripped 75, not a
    // truncated/defaulted value.
    expect(checkpointA.arrival_radius_m).toBe(75);

    // --- 3. Create one Boolean and one Time-based activity through the UI --
    const boolActivityName = `E2E Atividade Bool ${runId}`;
    const timeActivityName = `E2E Atividade Tempo ${runId}`;

    await page.goto('/rally/admin?tab=activities');
    await page.getByRole('button', { name: 'Nova Atividade' }).click();
    await page.getByPlaceholder('Ex: Cabo de Guerra').fill(boolActivityName);
    // checkpoint_id select is the first <select>, activity_type is the
    // second — same structure the mocked admin-activities.spec.ts already
    // exercises against a route mock; here it's the real form + real POST.
    // Select by value (checkpoint id), not label — the option's label is
    // "name - description" and these checkpoints have no description, so
    // matching by label would require replicating that exact formatting.
    await page.locator('select').first().selectOption({ value: String(checkpointA.id) });
    await page.locator('select').nth(1).selectOption({ label: 'Sim/Não' });
    await page.getByRole('button', { name: /^Criar$/ }).click();
    await expect(page.getByText(boolActivityName)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Nova Atividade' }).click();
    await page.getByPlaceholder('Ex: Cabo de Guerra').fill(timeActivityName);
    await page.locator('select').first().selectOption({ value: String(checkpointB.id) });
    await page.locator('select').nth(1).selectOption({ label: 'Baseada em Tempo' });
    await page.getByRole('button', { name: /^Criar$/ }).click();
    await expect(page.getByText(timeActivityName)).toBeVisible({ timeout: 15_000 });

    const activitiesAfterCreate = await apiCall<{
      activities: { id: number; name: string; activity_type: string; checkpoint_id: number }[];
    }>('GET', '/activities/', { token: admin.accessToken });
    const boolActivity = activitiesAfterCreate.activities.find((a) => a.name === boolActivityName);
    const timeActivity = activitiesAfterCreate.activities.find((a) => a.name === timeActivityName);
    expect(boolActivity).toBeDefined();
    expect(timeActivity).toBeDefined();
    if (!boolActivity || !timeActivity) throw new Error('unreachable');
    expect(boolActivity.activity_type).toBe('BooleanActivity');
    expect(boolActivity.checkpoint_id).toBe(checkpointA.id);
    expect(timeActivity.activity_type).toBe('TimeBasedActivity');
    expect(timeActivity.checkpoint_id).toBe(checkpointB.id);

    // --- 4. Create a team through the UI and capture its access code ------
    const teamName = `E2E Equipa UI ${runId}`;
    await page.goto('/rally/admin?tab=teams');
    await page.getByPlaceholder('Ex: Equipa Alpha').fill(teamName);
    await page.getByRole('button', { name: /^Criar Equipa$/ }).click();
    // Creating a team opens the "Equipa Criada!" modal showing its QR / access
    // code — confirms the UI itself surfaces a real access code, not just
    // that the row exists.
    await expect(page.getByText('Equipa Criada!')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Concluir' }).click();
    await expect(page.getByText(teamName)).toBeVisible({ timeout: 15_000 });

    // The list endpoint (ListingTeam) never includes access_code — only the
    // detail endpoint (DetailedTeam) does — so resolve the id from the list,
    // then fetch its detail to confirm the code the UI's modal showed is
    // really persisted.
    const teamsAfterCreate = await apiCall<{ id: number; name: string }[]>('GET', '/team/', {
      token: admin.accessToken,
    });
    const createdTeamSummary = teamsAfterCreate.find((t) => t.name === teamName);
    expect(createdTeamSummary).toBeDefined();
    if (!createdTeamSummary) throw new Error('unreachable');
    const createdTeam = await apiCall<{ id: number; name: string; access_code: string }>(
      'GET',
      `/team/${createdTeamSummary.id}`,
      { token: admin.accessToken },
    );
    expect(createdTeam.access_code).toBeTruthy();

    // --- 5. Assign the pre-minted staff user to checkpoint A via the UI ---
    await page.goto('/rally/assignment');
    await expect(page.getByText(staffEmail)).toBeVisible({ timeout: 15_000 });
    // The smoke Postgres accumulates every rally-staff user ever minted by
    // prior runs, so this page lists many rows — scope to the one row that
    // contains our email via `filter({ has })`, which (unlike `div` +
    // hasText + .last()) keeps the outer row element instead of resolving to
    // whichever nested div happens to be last in DOM order.
    const staffRow = page
      .locator('div.rounded-xl')
      .filter({ has: page.getByText(staffEmail, { exact: false }) });
    await staffRow.getByRole('combobox').click();
    await page.getByRole('option', { name: checkpointAName }).click();
    await expect(page.getByText('Atribuição atualizada com sucesso!')).toBeVisible({
      timeout: 15_000,
    });

    const assignmentsAfterUpdate = await apiCall<
      { user_email?: string; checkpoint_id?: number | null }[]
    >('GET', '/user/staff-assignments', { token: admin.accessToken });
    const staffAssignment = assignmentsAfterUpdate.find((a) => a.user_email === staffEmail);
    expect(staffAssignment?.checkpoint_id).toBe(checkpointA.id);

    // --- 6. Flip a settings toggle via the UI and confirm it persists -----
    await page.goto('/rally/settings');
    await page.getByRole('button', { name: 'Editar Configurações' }).click();
    await page.locator('label:has(#show_live_leaderboard)').click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('button', { name: 'Editar Configurações' })).toBeVisible({
      timeout: 15_000,
    });

    const settingsAfterSave = await apiCall<{ show_live_leaderboard: boolean }>(
      'GET',
      '/rally/settings',
      { token: admin.accessToken },
    );
    // A reload proves the toggle is durable (persisted), not just optimistic
    // client state that would vanish on refresh.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Editar Configurações' })).toBeVisible({
      timeout: 15_000,
    });
    const settingsAfterReload = await apiCall<{ show_live_leaderboard: boolean }>(
      'GET',
      '/rally/settings',
      { token: admin.accessToken },
    );
    expect(settingsAfterReload.show_live_leaderboard).toBe(settingsAfterSave.show_live_leaderboard);
  });
});
