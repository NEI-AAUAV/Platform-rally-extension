import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { seedRealOidcSession, apiCall, API_V1 } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";
import {
  seedPeddyTascasCast,
  loginTeam,
  type PeddyTascasCast,
} from "./helpers/seedPeddyTascasCast";

/**
 * "Um dia de Peddy Tascas" — the whole event, from the night-before setup to
 * the final standings, on one real backend.
 *
 * Why this exists even though the suite already has both a peddy-paper spec
 * and a master rally day:
 *
 *  - `peddy-paper.spec.ts` proves each peddy *mechanic* in isolation, with a
 *    single team, mostly through raw `fetch`, against an event its fixture
 *    built by direct API calls. Nobody staffs a post, nobody guides a team,
 *    no two teams are ever on the route at the same time, and no admin ever
 *    configured any of it — so it cannot tell you the mode is *playable*, only
 *    that its endpoints behave.
 *  - `master-rally-day.spec.ts` is the realistic full-day scenario, but for
 *    `rally_tascas`: staff check-ins and drinking mechanics, with the route
 *    fully revealed. None of the peddy toolkit (redaction, clues, GPS
 *    arrival, hints, skips, proximity, guide-vouched arrivals) is in play.
 *
 * The result was that the mode NEI actually runs a peddy tascas on had no
 * end-to-end rehearsal: no test ever configured it the way an organizer does,
 * and no test ever ran more than one team through it. This spec does both.
 *
 * Phase 1 builds the entire event through the **real admin UI** — every form
 * filled and clicked, nothing seeded by `apiCall` except the cast of users —
 * then reads it all back from the API to confirm the forms really wrote what
 * they appeared to. Phases 2 and 3 then play the day out with 11 concurrent
 * browser contexts and every role the system has:
 *
 *   admin · manager-rally · rally-staff ×2 · rally-guide ×2 · 5 teams · public
 *
 * `manager-rally` in particular was exercised by no fullstack spec at all
 * before this one, despite having its own ABAC action table and its own
 * cross-checkpoint evaluation page.
 *
 * The five teams deliberately take five *different* routes through the same
 * first riddle, because that is what actually happens: one solves it, one
 * gropes toward it with the proximity aid, one buys the hint ladder, one
 * gives up, and one's phone dies and a guide vouches for them. Each of those
 * is a different backend path, and each costs or scores differently.
 *
 * Serial: phase 2 has nothing to run against if phase 1's setup failed, and
 * `mode: 'serial'` reports that as a skip rather than as four more failures
 * with the same root cause.
 */

test.describe.configure({ mode: "serial" });

/** Aveiro, far enough from other fixtures' coordinates to never geofence-collide. */
const BASE_LATITUDE = 40.6443;
const BASE_LONGITUDE = -8.6455;
const ARRIVAL_RADIUS_M = 60;
// What `crud_rally_settings.get_or_create` bootstraps for a peddy_paper
// event. Asserted, never set by this spec — a regression in the bootstrap
// must fail here rather than be papered over by the fixture writing them.
const BOOTSTRAPPED_HINT_PENALTY = -10;
const BOOTSTRAPPED_SKIP_PENALTY = -25;
// What this event's organizer then changes it to, by hand, in the form. It
// has to differ from the bootstrapped value or the form never goes dirty and
// the save bar never appears — which is also the only way this spec can prove
// the settings form actually writes.
const ORGANIZER_SKIP_PENALTY = -30;
const SEARCH_RADIUS_M = 400;
/** The prize the rules don't cover, handed out by the admin mid-event. */
const DYNAMIC_AWARD_POINTS = 40;

interface BuiltCheckpoint {
  readonly id: number;
  readonly name: string;
  readonly order: number;
  readonly clue: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly activityId: number | null;
}

interface BuiltTeam {
  readonly id: number;
  readonly name: string;
  readonly accessCode: string;
}

interface PeddyTascasWorld {
  readonly cast: PeddyTascasCast;
  readonly eventId: number;
  readonly checkpoints: readonly BuiltCheckpoint[];
  readonly teams: readonly BuiltTeam[];
  readonly hints: readonly string[];
  readonly expectedAnswer: string;
}

/** Filled by phase 1, read by every later phase. */
let world: PeddyTascasWorld;

/**
 * The public scoreboard, opened once in phase 2 and deliberately never
 * reloaded or closed until the day is over.
 *
 * Kept at module scope rather than inside a single test because that is the
 * actual claim being made: a board projected in a bar at 09:00 is still
 * showing live standings at 18:00, having received every write in between
 * over SSE. Closing and reopening it per phase would quietly replace that
 * with "a fresh fetch shows the right numbers", which proves nothing about
 * the stream. Closed in afterAll.
 */
let publicPage: Page | undefined;

const CHECKPOINT_PLAN = [
  {
    // No activity: a riddle post the team completes just by turning up. This
    // is the shape most peddy-paper posts have, and the one whose arrival
    // must auto-complete rather than wait for a staff score.
    label: "Ponte",
    clue: "Onde o rio encontra a ponte de ferro.",
    latitude: BASE_LATITUDE,
    longitude: BASE_LONGITUDE,
    hasActivity: false,
  },
  {
    label: "Mercado",
    clue: "Debaixo do relógio que já não dá horas.",
    // ~1.1 km north — comfortably outside post 1's 60 m geofence.
    latitude: BASE_LATITUDE + 0.01,
    longitude: BASE_LONGITUDE,
    hasActivity: true,
  },
  {
    label: "Sé",
    clue: "Onde os sinos chamam quem já não os ouve.",
    latitude: BASE_LATITUDE + 0.02,
    longitude: BASE_LONGITUDE,
    hasActivity: true,
    // The last post keeps hours: it opens well after the teams get there.
    // Real routes are full of these — the bar on the list that doesn't open
    // until 18h — and the point of phase 5 is what a team is told when it is
    // standing at a door that isn't open yet.
    opensInHours: 6,
  },
] as const;

const TEAM_LABELS = ["Alpha", "Beta", "Gama", "Delta", "Epsilon"] as const;

/**
 * Which teams get a guide walking with them, by index into TEAM_LABELS.
 *
 * Not simply the first N: a guide may only write progress for the post their
 * own team is currently on (`GuideService.accessible_checkpoint_ids`), so the
 * guide who has to vouch for the flat-battery team in phase 2 must be that
 * team's own guide. Alpha (0) is guided because phase 2 watches a guide read
 * a live clue; Epsilon (4) is guided because its phone dies.
 */
const GUIDED_TEAM_INDEXES = [0, 4] as const;

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function newAuthedPage(
  browser: Browser,
  user: Parameters<typeof seedRealOidcSession>[1],
): Promise<Page> {
  const context = await browser.newContext();
  await seedRealOidcSession(context, user);
  return context.newPage();
}

/**
 * A local-time value in the shape an `<input type="datetime-local">` accepts.
 *
 * Deliberately built from the local-time getters rather than `toISOString()`:
 * the input is local-time and the browser reads it as such, so a UTC string
 * would shift the opening hour by the runner's offset and make the fixture
 * behave differently depending on where CI runs.
 */
function datetimeLocal(epochMillis: number): string {
  const at = new Date(epochMillis);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}

/** Put a team session in a browser without spending per-IP login budget. */
async function seedTeamSession(context: BrowserContext, team: BuiltTeam, token: string) {
  await context.addInitScript(
    ([tok, id, name]) => {
      localStorage.setItem("rally_team_token", tok as string);
      localStorage.setItem(
        "rally_team_data",
        JSON.stringify({ team_id: Number(id), team_name: name }),
      );
    },
    [token, String(team.id), team.name] as [string, string, string],
  );
}

/**
 * Save the settings form and wait for the save bar to go away again.
 *
 * The bar is rendered only while `form.formState.isDirty` (settings/index.tsx),
 * so it is both the control to click and the signal that the write landed.
 * The explicit timeout matters: Playwright's default action timeout is
 * unbounded, so a form that never goes dirty — because the "change" happened
 * to match the value already there — burns the whole test timeout instead of
 * failing in seconds.
 */
async function saveSettings(page: Page): Promise<void> {
  const save = page.getByRole("button", { name: "Guardar" });
  await save.click({ timeout: 15_000 });
  await expect(save).toBeHidden({ timeout: 15_000 });
}

/**
 * Block until a just-saved setting is readable back from the API.
 *
 * The API runs several uvicorn workers, so a settings write made through the
 * form is not necessarily visible to the next request that lands on a
 * different worker. Waiting on the *read* is the only safe way to bridge that:
 * polling the mutating call instead would retry a create — and a create that
 * succeeds on a status the assertion didn't expect keeps being retried,
 * quietly inserting a row per attempt until some limit turns it into a
 * different error. (That is exactly how this spec first filled a team with ten
 * identical members.)
 */
async function waitForSetting(
  token: string,
  key: string,
  value: unknown,
  ): Promise<void> {
  await expect
    .poll(
      async () =>
        (await apiCall<Record<string, unknown>>("GET", "/rally/settings", { token }))[key],
      { timeout: 20_000 },
    )
    .toBe(value);
}

/** Stand the browser at a checkpoint's real coordinates. */
async function standAt(context: BrowserContext, checkpoint: BuiltCheckpoint) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
  });
}

/**
 * Score one team's activity through the real staff evaluation UI.
 *
 * Mirrors master-rally-day.spec.ts's helper, including its two hard-won
 * details: BooleanForm's success control is a visually-hidden checkbox with a
 * styled label on top (so the label is the thing to click), and the success
 * toast must be matched exactly — a looser "avaliad[ao]" also matches the
 * ever-present "Já avaliadas" heading the moment any team at this post has
 * been scored. `.first()` because consecutive submissions stack toasts faster
 * than each one's dismiss timer.
 */
async function evaluateOnPage(page: Page, teamName: string): Promise<void> {
  await page.getByText(teamName).first().click();
  await page.getByRole("button", { name: /avaliar|evaluate/i }).first().click();
  await page.getByText("Equipa teve sucesso na atividade").first().click();
  await page
    .getByRole("button", {
      name: /submit evaluation|submeter avaliação|atualizar avaliação/i,
    })
    .click();
  await expect(page.getByText("Atividade avaliada com sucesso!").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByText("Voltar às equipas").click();
}

/**
 * Spend the whole hint ladder for the team's current post, through the UI.
 *
 * Driven from the page rather than the endpoint because the price and the
 * confirm dialog are the part a team actually meets before losing points —
 * and because the UI only offers the give-up button once this is exhausted.
 */
async function buyEveryHint(page: Page): Promise<void> {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/rally/team-progress");
  for (const hint of world.hints) {
    const hintButton = page.getByRole("button", { name: /Pedir pista/ });
    await expect(hintButton).toBeVisible({ timeout: 15_000 });
    await hintButton.click();
    await expect(page.getByText(hint)).toBeVisible({ timeout: 15_000 });
  }
}

/** A team's own GPS arrival, straight at the real endpoint. */
async function arriveByGps(
  token: string,
  checkpoint: BuiltCheckpoint,
): Promise<{ status: number; body: string }> {
  const response = await fetch(`${API_V1}/checkpoint/${checkpoint.id}/arrive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
    }),
  });
  return { status: response.status, body: await response.text() };
}

test.describe("Um dia de Peddy Tascas — da configuração ao pódio", () => {
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // ---------------------------------------------------------------------
  // FASE 1 — A VÉSPERA
  // ---------------------------------------------------------------------
  test("Véspera — a organização monta o peddy tascas inteiro pelo UI de admin", async ({
    browser,
  }) => {
    const cast = await seedPeddyTascasCast({ staffCount: 2, guideCount: 2 });
    const { runId } = cast;
    const adminPage = await newAuthedPage(browser, cast.admin.user);

    try {
      // --- 1. The event itself, with the mode chosen from the real select ---
      // The event *type* is the single decision that turns a checkpoint list
      // into a treasure hunt: api-rally bootstraps the whole peddy settings
      // profile off it (crud_rally_settings.get_or_create). Picking it from
      // the real dropdown is therefore the most load-bearing click in setup.
      const eventName = `E2E Peddy Tascas ${runId}`;
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(eventName);
      await adminPage.locator("#ev-type").click();
      await adminPage.getByRole("option", { name: "Peddy-paper" }).click();
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(eventName)).toBeVisible({ timeout: 15_000 });

      const events = await apiCall<{ id: number; name: string; event_type: string; is_current: boolean }[]>(
        "GET",
        "/events",
        { token: cast.admin.user.accessToken },
      );
      const createdEvent = events.find((e) => e.name === eventName);
      expect(createdEvent).toBeDefined();
      if (!createdEvent) throw new Error("unreachable");
      // The dropdown really submitted peddy_paper, not the default.
      expect(createdEvent.event_type).toBe("peddy_paper");

      if (!createdEvent.is_current) {
        const eventCard = adminPage.locator(".rally-surface", { hasText: eventName });
        await eventCard.getByRole("button", { name: "Tornar atual" }).click();
        await expect(eventCard.getByText("Atual", { exact: true })).toBeVisible({
          timeout: 15_000,
        });
      }
      const currentEvent = await apiCall<{ id: number }>("GET", "/events/current", {
        token: cast.admin.user.accessToken,
      });
      expect(currentEvent.id).toBe(createdEvent.id);

      // --- 2. The mode's settings bootstrap, asserted not assumed ----------
      // Read through the settings *UI* rather than the API: an organizer who
      // opens this page before an event must see the mode already configured.
      // A regression in the bootstrap shows up here as an unchecked switch.
      await adminPage.goto("/rally/settings");
      await adminPage.getByRole("button", { name: "Jogo" }).click();
      // The switch itself is an `sr-only` checkbox inside a styled <label>
      // (components/ui/switch.tsx) — assert on the input's checked *property*
      // (toBeChecked), since React leaves the initial `checked` attribute
      // stale, and click the wrapping label, since the input is not visible.
      await expect(adminPage.locator("#reveal_next_checkpoint")).not.toBeChecked();
      await expect(adminPage.locator("#gps_checkin_enabled")).toBeChecked();
      await expect(adminPage.locator("#participant_view_enabled")).toBeChecked();
      await expect(adminPage.locator("#hints_enabled")).toBeChecked();
      await expect(adminPage.locator("#skip_enabled")).toBeChecked();
      // The guide fallback for a dead phone — phase 2 depends on it.
      await expect(adminPage.locator("#guide_manual_arrival_enabled")).toBeChecked();
      await expect(adminPage.locator("#hint_penalty")).toHaveValue(
        String(BOOTSTRAPPED_HINT_PENALTY),
      );
      await expect(adminPage.locator("#skip_penalty")).toHaveValue(
        String(BOOTSTRAPPED_SKIP_PENALTY),
      );

      // Now an actual organizer decision: giving up should sting a little
      // more than the bootstrap suggests. The save bar only exists while the
      // form is dirty, so this doubles as the proof that the form writes.
      await adminPage.locator("#skip_penalty").fill(String(ORGANIZER_SKIP_PENALTY));
      await saveSettings(adminPage);

      // The search aids live under Rota, and are off by default — this event
      // runs in a city half the teams don't know, so they go on.
      await adminPage.getByRole("button", { name: "Rota" }).click();
      await adminPage.locator("label:has(#proximity_enabled)").click();
      await adminPage.locator("label:has(#compass_enabled)").click();
      await adminPage.locator("#search_radius_m").fill(String(SEARCH_RADIUS_M));
      await saveSettings(adminPage);

      // Guide mode is a module switch, off by default and *not* part of the
      // peddy bootstrap — an event that wants guides has to turn it on, and
      // until it does, the admin's "Guias" assignment page refuses to render
      // at all (guide-assignment/index.tsx returns early on
      // `!settings.guide_mode_enabled`). Turning it on here is therefore not
      // fixture convenience but a genuine, and easy to forget, setup step:
      // the two guides in phase 2 have nowhere to be assigned without it.
      await adminPage.getByRole("button", { name: "Visualização" }).click();
      await adminPage.locator("label:has(#guide_mode_enabled)").click();
      await adminPage.locator("label:has(#guide_mode_active)").click();
      // A peddy tascas is watched from a bar by people with no login. Public
      // access is already on out of the box (asserted, not clicked — clicking
      // would turn it *off*), but every event bootstraps scores hidden, so the
      // standings themselves are a deliberate choice. Phase 2's anonymous
      // viewer sees an empty board without this one.
      await expect(adminPage.locator("#public_access_enabled")).toBeChecked();
      await adminPage.locator("#show_score_mode").click();
      await adminPage.getByRole("option", { name: "Classificação completa" }).click();
      await saveSettings(adminPage);

      const settings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
        token: cast.admin.user.accessToken,
      });
      expect(settings.reveal_next_checkpoint).toBe(false);
      expect(settings.gps_checkin_enabled).toBe(true);
      expect(settings.hint_penalty).toBe(BOOTSTRAPPED_HINT_PENALTY);
      expect(settings.skip_penalty).toBe(ORGANIZER_SKIP_PENALTY);
      expect(settings.proximity_enabled).toBe(true);
      expect(settings.compass_enabled).toBe(true);
      expect(settings.search_radius_m).toBe(SEARCH_RADIUS_M);
      // The guide fallback must be on for phase 2's flat-battery team.
      expect(settings.guide_manual_arrival_enabled).toBe(true);
      expect(settings.guide_mode_enabled).toBe(true);
      expect(settings.guide_mode_active).toBe(true);
      expect(settings.public_access_enabled).toBe(true);
      expect(settings.show_score_mode).toBe("competitive");
      // Both of these start off, and phase 5 is about an organizer reaching
      // for them mid-event. Asserted here so that phase 5's "before" really is
      // a before.
      expect(settings.allow_staff_registration).toBe(false);
      expect(settings.checkpoint_hours_enabled).toBe(true);

      // --- 3. Three posts, each with its riddle, through the real form -----
      await adminPage.goto("/rally/admin?tab=checkpoints");
      const checkpointNames = CHECKPOINT_PLAN.map(
        (plan) => `E2E ${plan.label} ${runId}`,
      );
      for (const [index, plan] of CHECKPOINT_PLAN.entries()) {
        await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(checkpointNames[index]!);
        await adminPage.getByPlaceholder("Ex: 40.6405").fill(String(plan.latitude));
        await adminPage.getByPlaceholder("Ex: -8.6538").fill(String(plan.longitude));
        await adminPage.getByPlaceholder("Ex: 50").fill(String(ARRIVAL_RADIUS_M));
        await adminPage
          .getByPlaceholder("Ex: Onde o rio encontra a ponte de ferro...")
          .fill(plan.clue);
        const opensInHours = "opensInHours" in plan ? plan.opensInHours : undefined;
        if (opensInHours !== undefined) {
          await adminPage
            .getByLabel("Abre a (opcional)")
            .fill(datetimeLocal(Date.now() + opensInHours * 3_600_000));
        }
        await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
        await expect(adminPage.getByText(checkpointNames[index]!)).toBeVisible({
          timeout: 15_000,
        });
      }

      const createdCheckpoints = await apiCall<
        {
          id: number;
          name: string;
          order: number;
          clue: string | null;
          latitude: number | null;
          arrival_radius_m: number;
          available_from: string | null;
        }[]
      >("GET", "/checkpoint/", { token: cast.admin.user.accessToken });

      const checkpoints: BuiltCheckpoint[] = CHECKPOINT_PLAN.map((plan, index) => {
        const name = checkpointNames[index]!;
        const row = createdCheckpoints.find((c) => c.name === name);
        expect(row, `checkpoint ${name} was not created by the form`).toBeDefined();
        if (!row) throw new Error("unreachable");
        // The form auto-assigns order = max + 1; on a fresh event that is 1..n.
        expect(row.order).toBe(index + 1);
        // The riddle, the coordinates and the geofence all round-tripped —
        // without all three the mode is unplayable, and each is a separate
        // input on the form.
        expect(row.clue).toBe(plan.clue);
        expect(row.arrival_radius_m).toBe(ARRIVAL_RADIUS_M);
        expect(row.latitude).toBeCloseTo(plan.latitude, 5);
        // The opening time is what phase 5 turns on; a form that dropped it
        // would make that phase silently test nothing.
        if ("opensInHours" in plan) {
          expect(row.available_from, `${name} lost its opening time`).toBeTruthy();
          expect(new Date(row.available_from!).getTime()).toBeGreaterThan(Date.now());
        } else {
          expect(row.available_from).toBeNull();
        }
        return {
          id: row.id,
          name,
          order: row.order,
          clue: plan.clue,
          latitude: plan.latitude,
          longitude: plan.longitude,
          activityId: null,
        };
      });

      // --- 4. The hint ladder on post 1, through the real form ------------
      // Vaguest rung first. `expected_answer` is what the guide is holding;
      // phase 2 asserts it never reaches a team.
      const hints = [
        `Segue o rio para norte. (${runId})`,
        `Procura a placa azul junto ao cais. (${runId})`,
      ] as const;
      const expectedAnswer = `RESPOSTA-SECRETA-${runId}`;

      // Each post is a <li> whose accessible name the list sets explicitly
      // (CheckpointListItem), and the indications editor is inside the panel
      // that the "Fotos e curiosidades do sítio" button expands. Every post's
      // panel holds an identically-placeholdered set of inputs, so all of
      // this has to stay scoped to the one row — an unscoped getByPlaceholder
      // matches every expanded post at once.
      // Reload first: CheckpointManagement passes `forceExpanded` to whichever
      // checkpoint was just created, so after the loop above some rows are
      // already open and a blind click would *collapse* the one we want. A
      // fresh load has every row collapsed, which makes the toggle below
      // mean what it says.
      await adminPage.goto("/rally/admin?tab=checkpoints");

      const firstPostRow = adminPage.getByRole("listitem", {
        name: `Checkpoint ${checkpoints[0]!.name}, ordem ${checkpoints[0]!.order}`,
      });
      const expandFirstPost = firstPostRow.getByRole("button", {
        name: "Fotos e curiosidades do sítio",
      });
      // dispatchEvent, not click(): the whole row is `draggable` while
      // collapsed (the list is reordered by dragging), so the browser reads
      // Playwright's synthesized mousedown/move/up as the start of a drag and
      // never delivers the click to the button inside it. Dispatching the
      // event directly is the reliable way past a draggable ancestor — and
      // aria-expanded is then the proof the panel really opened, rather than
      // an assumption that the click landed.
      await expandFirstPost.dispatchEvent("click");
      await expect(expandFirstPost).toHaveAttribute("aria-expanded", "true");

      for (const hint of hints) {
        await firstPostRow
          .getByPlaceholder("Indicação a dar à equipa (ex: Aponta para a estátua e pergunta…)")
          .fill(hint);
        await firstPostRow
          .getByPlaceholder("Pergunta (opcional)")
          .fill("Em que ano foi construída?");
        await firstPostRow.getByPlaceholder("Resposta esperada (opcional)").fill(expectedAnswer);
        await firstPostRow.getByRole("button", { name: "Adicionar indicação" }).click();
        await expect(firstPostRow.getByText(hint)).toBeVisible({ timeout: 15_000 });
      }

      const indications = await apiCall<{ hint: string; expected_answer: string | null }[]>(
        "GET",
        `/checkpoint/${checkpoints[0]!.id}/guide-indications`,
        { token: cast.admin.user.accessToken },
      );
      expect(indications.map((i) => i.hint)).toEqual([...hints]);
      expect(indications[0]!.expected_answer).toBe(expectedAnswer);

      // --- 5. An activity at each staffed post, through the real form -----
      await adminPage.goto("/rally/admin?tab=activities");
      const activityNames = new Map<number, string>();
      for (const [index, plan] of CHECKPOINT_PLAN.entries()) {
        if (!plan.hasActivity) continue;
        const checkpoint = checkpoints[index]!;
        const activityName = `E2E Prova ${plan.label} ${runId}`;
        activityNames.set(checkpoint.id, activityName);
        await adminPage.getByRole("button", { name: "Nova Atividade" }).click();
        await adminPage.getByPlaceholder("Ex: Cabo de Guerra").fill(activityName);
        await adminPage.locator("select").first().selectOption({ value: String(checkpoint.id) });
        await adminPage.locator("select").nth(1).selectOption({ label: "Sim/Não" });
        await adminPage.getByRole("button", { name: /^Criar$/ }).click();
        await expect(adminPage.getByText(activityName)).toBeVisible({ timeout: 15_000 });
      }

      const createdActivities = await apiCall<{
        activities: { id: number; name: string; checkpoint_id: number; activity_type: string }[];
      }>("GET", "/activities/", { token: cast.admin.user.accessToken });
      const withActivities: BuiltCheckpoint[] = checkpoints.map((checkpoint) => {
        const activityName = activityNames.get(checkpoint.id);
        if (!activityName) return checkpoint;
        const activity = createdActivities.activities.find((a) => a.name === activityName);
        expect(activity, `activity ${activityName} was not created`).toBeDefined();
        if (!activity) throw new Error("unreachable");
        expect(activity.checkpoint_id).toBe(checkpoint.id);
        expect(activity.activity_type).toBe("BooleanActivity");
        return { ...checkpoint, activityId: activity.id };
      });

      // --- 6. Five teams, through the real form ---------------------------
      await adminPage.goto("/rally/admin?tab=teams");
      const teamNames = TEAM_LABELS.map((label) => `E2E Equipa ${label} ${runId}`);
      for (const teamName of teamNames) {
        await adminPage.getByPlaceholder("Ex: Equipa Alpha").fill(teamName);
        await adminPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
        // The modal is the only place the UI ever shows an access code.
        await expect(adminPage.getByText("Equipa Criada!")).toBeVisible({ timeout: 15_000 });
        await adminPage.getByRole("button", { name: "Concluir" }).click();
        await expect(adminPage.getByText(teamName)).toBeVisible({ timeout: 15_000 });
      }

      const teamRows = await apiCall<{ id: number; name: string }[]>("GET", "/team/", {
        token: cast.admin.user.accessToken,
      });
      const teams: BuiltTeam[] = [];
      for (const teamName of teamNames) {
        const summary = teamRows.find((t) => t.name === teamName);
        expect(summary, `team ${teamName} was not created by the form`).toBeDefined();
        if (!summary) throw new Error("unreachable");
        // Only the detail endpoint carries access_code (ListingTeam omits it).
        const detail = await apiCall<{ id: number; name: string; access_code: string }>(
          "GET",
          `/team/${summary.id}`,
          { token: cast.admin.user.accessToken },
        );
        expect(detail.access_code).toBeTruthy();
        teams.push({ id: detail.id, name: teamName, accessCode: detail.access_code });
      }

      // --- 7. Staff to their posts, through the assignment UI -------------
      await adminPage.goto("/rally/assignment");
      const staffedCheckpoints = withActivities.filter((c) => c.activityId !== null);
      expect(staffedCheckpoints).toHaveLength(cast.staff.length);
      for (const [index, member] of cast.staff.entries()) {
        await expect(adminPage.getByText(member.email)).toBeVisible({ timeout: 15_000 });
        // The smoke Postgres accumulates every rally-staff user ever minted,
        // so scope to the row holding this email (see admin-setup.spec.ts).
        const row = adminPage
          .locator("div.rounded-xl")
          .filter({ has: adminPage.getByText(member.email, { exact: false }) });
        await row.getByRole("combobox").click();
        await adminPage
          .getByRole("option", { name: staffedCheckpoints[index]!.name })
          .click();
        await expect(adminPage.getByText("Atribuição atualizada com sucesso!")).toBeVisible({
          timeout: 15_000,
        });
      }

      const staffAssignments = await apiCall<
        { user_email?: string; checkpoint_id?: number | null }[]
      >("GET", "/user/staff-assignments", { token: cast.admin.user.accessToken });
      for (const [index, member] of cast.staff.entries()) {
        const assignment = staffAssignments.find((a) => a.user_email === member.email);
        expect(assignment?.checkpoint_id).toBe(staffedCheckpoints[index]!.id);
      }

      // --- 8. Guides to their teams, through the guide-assignment UI ------
      // A guide follows one team along the whole route (unlike staff, who own
      // a post) — so the assignment is to a team, on its own page.
      await adminPage.goto("/rally/guide-assignment");
      const guidedTeams = GUIDED_TEAM_INDEXES.map((teamIndex) => teams[teamIndex]!);
      for (const [index, guide] of cast.guides.entries()) {
        await expect(adminPage.getByText(guide.email)).toBeVisible({ timeout: 15_000 });
        const row = adminPage
          .locator("div.rounded-xl")
          .filter({ has: adminPage.getByText(guide.email, { exact: false }) });
        await row.getByRole("combobox").click();
        await adminPage.getByRole("option", { name: guidedTeams[index]!.name }).click();
        await expect(adminPage.getByText("Atribuição atualizada com sucesso!")).toBeVisible({
          timeout: 15_000,
        });
      }

      const guideAssignments = await apiCall<{ user_email?: string; team_id?: number | null }[]>(
        "GET",
        "/user/guide-assignments",
        { token: cast.admin.user.accessToken },
      );
      for (const [index, guide] of cast.guides.entries()) {
        const assignment = guideAssignments.find((a) => a.user_email === guide.email);
        expect(assignment?.team_id).toBe(guidedTeams[index]!.id);
      }

      world = {
        cast,
        eventId: createdEvent.id,
        checkpoints: withActivities,
        teams,
        hints,
        expectedAnswer,
      };
    } finally {
      await adminPage.context().close();
    }
  });

  // ---------------------------------------------------------------------
  // FASE 2 — A MANHÃ: cinco equipas, um enigma, cinco maneiras de o resolver
  // ---------------------------------------------------------------------
  test("Manhã — 5 equipas atacam o primeiro enigma por cinco caminhos diferentes, com o guia e o público a ver", async ({
    browser,
  }) => {
    const { cast, checkpoints, teams } = world;
    const [ponte, mercado] = checkpoints;
    const [alpha, beta, gama, delta, epsilon] = teams;

    // Each team's own session, minted once and shared between its browser
    // context and this test's direct API reads.
    const tokens = Object.fromEntries(
      await Promise.all(
        teams.map(async (team) => [team.id, await loginTeam(team.accessCode)] as const),
      ),
    ) as Record<number, string>;

    publicPage = await newPage(browser);
    const guideAlphaPage = await newAuthedPage(browser, cast.guides[0]!.user);
    const guideEpsilonPage = await newAuthedPage(browser, cast.guides[1]!.user);
    const teamPages = await Promise.all(teams.map(() => newPage(browser)));
    const [alphaPage, betaPage, gamaPage, deltaPage] = teamPages;

    try {
      for (const [index, team] of teams.entries()) {
        await seedTeamSession(teamPages[index]!.context(), team, tokens[team.id]!);
      }

      // The public scoreboard opens now and is never reloaded again. Every
      // later assertion on it can only be satisfied by a real SSE push.
      await publicPage.goto("/rally/scoreboard");
      await expect(publicPage.getByText(alpha.name)).toBeVisible({ timeout: 20_000 });

      // --- The route is a riddle, for everyone, at the same time ----------
      // Read from the *real* payload rather than the page: a mocked spec
      // asserting "the name isn't rendered" only proves its own fixture.
      await Promise.all(
        teams.map(async (team) => {
          const visible = await apiCall<
            { order: number; name: string; latitude: number | null; clue: string | null }[]
          >("GET", "/checkpoint/", { token: tokens[team.id]! });
          const first = visible.find((cp) => cp.order === 1)!;
          expect(first.clue).toBe(ponte!.clue);
          // The location is the answer, so none of it may be in the payload.
          expect(first.latitude).toBeNull();
          expect(JSON.stringify(visible)).not.toContain(ponte!.name);
          expect(JSON.stringify(visible)).not.toContain(String(ponte!.latitude));
          // Nor may the guide's answer key ever reach a team.
          expect(JSON.stringify(visible)).not.toContain(world.expectedAnswer);
        }),
      );

      // --- Alpha: solves it, and checks in through the real GPS button ----
      // Concurrently, its guide opens the guide view and reads the same
      // clue — unredacted, because a guide standing at the answer cannot
      // help a stuck team without knowing what it was asked.
      await standAt(alphaPage.context(), ponte!);
      await Promise.all([
        (async () => {
          await alphaPage.goto("/rally/team-progress");
          await expect(alphaPage.getByText("Enigma")).toBeVisible({ timeout: 20_000 });
          await expect(alphaPage.getByText(ponte!.clue).first()).toBeVisible();
          // The post's real name is nowhere on the participant's screen…
          await expect(alphaPage.getByText(ponte!.name)).toHaveCount(0);
          // …nor are 6-decimal coordinates, which are only rendered once a
          // post has been revealed.
          await expect(alphaPage.getByText(/-?\d+\.\d{6}, -?\d+\.\d{6}/)).toHaveCount(0);
        })(),
        (async () => {
          await guideAlphaPage.goto("/rally/guide");
          await expect(guideAlphaPage.getByText("Postos — Visão do Guia")).toBeVisible({
            timeout: 20_000,
          });
          await expect(guideAlphaPage.getByText(ponte!.clue).first()).toBeVisible({
            timeout: 15_000,
          });
        })(),
      ]);

      // The whole suite's API tests hammer this backend at once, so a
      // geolocation-gated check-in can come back as a transient error under
      // saturation. Retry the click rather than failing outright (the same
      // workaround peddy-paper.spec.ts already carries).
      await expect(async () => {
        await alphaPage.getByRole("button", { name: "Check-in GPS" }).click();
        await expect(
          alphaPage.getByText(/Posto concluído|Check-in registado|Já registado/),
        ).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000 });

      // --- Beta: doesn't know the city, gropes toward it with the aid -----
      // Two readings from two distances: the far one must be a coarse band
      // with no bearing (a bearing from 800 m away points straight at the
      // answer), the near one may add the compass.
      const readProximity = async (
        token: string,
        latitude: number,
        longitude: number,
      ): Promise<{ band: string; direction: string | null; raw: string }> => {
        const response = await fetch(`${API_V1}/checkpoint/${ponte!.id}/proximity`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
        });
        expect(response.status).toBe(200);
        const raw = await response.text();
        const parsed = JSON.parse(raw) as { band: string; direction: string | null };
        return { ...parsed, raw };
      };

      const far = await readProximity(tokens[beta!.id]!, ponte!.latitude + 0.0072, ponte!.longitude);
      expect(far.band).toBe("menos de 2km");
      expect(far.direction).toBeNull();
      // Nor may the reply carry the post's own position.
      expect(far.raw).not.toContain(String(ponte!.latitude));

      const near = await readProximity(
        tokens[beta!.id]!,
        ponte!.latitude - 0.0005,
        ponte!.longitude,
      );
      expect(near.band).toBe("menos de 100m");
      // Inside the closest band the puzzle is already solved; the compass
      // only helps find the door.
      expect(near.direction).toBe("N");

      // Beta also gets the search circle a redacted post carries — a
      // neighbourhood to search, deliberately not centred on the answer.
      const betaRoute = await apiCall<
        {
          order: number;
          latitude: number | null;
          search_latitude: number | null;
          search_radius_m: number | null;
        }[]
      >("GET", "/checkpoint/", { token: tokens[beta!.id]! });
      const betaFirst = betaRoute.find((cp) => cp.order === 1)!;
      expect(betaFirst.search_radius_m).toBe(SEARCH_RADIUS_M);
      expect(betaFirst.latitude).toBeNull();
      expect(betaFirst.search_latitude).not.toBe(ponte!.latitude);

      // Having narrowed it down, Beta walks in and checks in for real.
      await standAt(betaPage.context(), ponte!);
      const betaArrival = await arriveByGps(tokens[beta!.id]!, ponte!);
      expect(betaArrival.status).toBe(200);

      // --- Gama: can't solve it, buys the whole hint ladder ---------------
      // Through the UI, because the confirm dialog and the price shown to the
      // team are the part a team actually sees before spending points.
      await standAt(gamaPage.context(), ponte!);
      await buyEveryHint(gamaPage);
      // The answer key behind those hints still never reaches the team.
      expect(await gamaPage.content()).not.toContain(world.expectedAnswer);

      // The charge is real, and it is one award per rung — never more.
      const gamaAwards = await apiCall<{ points: number }[]>(
        "GET",
        `/dynamic-awards?team_id=${gama!.id}`,
        { token: cast.admin.user.accessToken },
      );
      expect(gamaAwards.filter((a) => a.points === BOOTSTRAPPED_HINT_PENALTY)).toHaveLength(
        world.hints.length,
      );

      // With the ladder spent, Gama finally finds it.
      expect((await arriveByGps(tokens[gama!.id]!, ponte!)).status).toBe(200);

      // --- Delta: buys everything, still can't find it, gives up ----------
      // Through the UI, and in that order, because the UI only offers the
      // give-up button once the hint ladder is spent (NextCheckpointCard's
      // `canGiveUp`) — it is meant to read as a last resort, not a shortcut.
      // The button also has to be carrying the organizer's price from phase 1
      // rather than the bootstrapped one, since that number is the last thing
      // the team sees before deciding.
      await standAt(deltaPage.context(), ponte!);
      await buyEveryHint(deltaPage);
      const giveUpButton = deltaPage.getByRole("button", {
        name: `Desistir deste posto (${ORGANIZER_SKIP_PENALTY} pts)`,
      });
      await expect(giveUpButton).toBeVisible({ timeout: 15_000 });
      await giveUpButton.click();

      // The point of the escape hatch: no longer stuck, and holding the next
      // riddle instead.
      await expect
        .poll(
          async () =>
            (
              await apiCall<{ order: number }>("GET", "/checkpoint/me", {
                token: tokens[delta!.id]!,
              })
            ).order,
          { timeout: 20_000 },
        )
        .toBe(2);
      const deltaNext = await apiCall<{ order: number; clue: string | null }>(
        "GET",
        "/checkpoint/me",
        { token: tokens[delta!.id]! },
      );
      expect(deltaNext.clue).toBe(mercado!.clue);
      // And it cost the price the admin typed into the form in phase 1, not
      // the value the backend bootstrapped.
      const deltaAwards = await apiCall<{ points: number }[]>(
        "GET",
        `/dynamic-awards?team_id=${delta!.id}`,
        { token: cast.admin.user.accessToken },
      );
      expect(deltaAwards.filter((a) => a.points === ORGANIZER_SKIP_PENALTY)).toHaveLength(1);

      // --- Epsilon: flat battery. Its guide vouches, through the guide UI --
      // This is the documented fallback for the one failure mode a redacted
      // route cannot otherwise survive (GPS is the *only* proof of arrival a
      // team can produce for itself), and nothing in this suite covered it.
      await guideEpsilonPage.goto("/rally/guide");
      await expect(guideEpsilonPage.getByText("Postos — Visão do Guia")).toBeVisible({
        timeout: 20_000,
      });
      // The teams panel renders only on the guide's team's current post, and
      // that card is already expanded — Epsilon has resolved nothing yet, so
      // its current post is order 1.
      const arrivalSelect = guideEpsilonPage.locator(`#arrival-team-${ponte!.id}`);
      await expect(arrivalSelect).toBeVisible({ timeout: 20_000 });
      await arrivalSelect.selectOption({ label: epsilon!.name });
      await guideEpsilonPage.getByRole("button", { name: "Marcar chegada" }).click();
      // Post 1 has no activity, so vouching for the arrival *completes* it and
      // Epsilon's current post becomes 2 — which unmounts this whole panel,
      // since it renders only on the guide's team's current post. So the
      // arrivals row this click created is gone from the screen a moment
      // after it appears, and the durable UI consequence to assert is the
      // narrower one: the team is no longer offered as still-pending.
      await expect(guideEpsilonPage.getByRole("option", { name: epsilon!.name })).toHaveCount(0, {
        timeout: 20_000,
      });
      // The authoritative check — the arrival exists, and is recorded as
      // vouched-for rather than passed off as a GPS fix.
      await expect
        .poll(
          async () => {
            const rows = await apiCall<{ team_id: number; arrived_by_guide: boolean }[]>(
              "GET",
              `/guide/checkpoints/${ponte!.id}/teams`,
              { token: cast.guides[1]!.user.accessToken },
            );
            return rows.find((row) => row.team_id === epsilon!.id)?.arrived_by_guide;
          },
          { timeout: 20_000 },
        )
        .toBe(true);

      // --- Everyone who reached post 1 has it revealed and the next riddle --
      // Delta is excluded on purpose: giving up resolves a post without ever
      // revealing it, which is the whole difference between the two exits.
      for (const team of [alpha!, beta!, gama!, epsilon!]) {
        await expect
          .poll(
            async () => {
              const route = await apiCall<{ order: number; name: string }[]>("GET", "/checkpoint/", {
                token: tokens[team.id]!,
              });
              return route.find((cp) => cp.order === 1)?.name;
            },
            { timeout: 20_000 },
          )
          .toBe(ponte!.name);

        const next = await apiCall<{ order: number; clue: string | null }>(
          "GET",
          "/checkpoint/me",
          { token: tokens[team.id]! },
        );
        expect(next.order).toBe(2);
        expect(next.clue).toBe(mercado!.clue);
      }

      // A post nobody has reached is still sealed: its photos would give the
      // place away as surely as its coordinates.
      const sealedMedia = await fetch(`${API_V1}/checkpoint/${checkpoints[2]!.id}/media`, {
        headers: { Authorization: `Bearer ${tokens[alpha!.id]!}` },
      });
      expect(sealedMedia.status).toBe(403);

      // --- The guide's own record of the morning --------------------------
      // Who turned up, in what order, and — the part that matters at the
      // post — which hints they already paid for, so the guide does not read
      // one out for free seconds after a team bought it.
      const atPonte = await apiCall<
        { team_id: number; team_name: string; revealed_indication_ids: number[]; arrived_by_guide: boolean }[]
      >("GET", `/guide/checkpoints/${ponte!.id}/teams`, {
        token: cast.guides[1]!.user.accessToken,
      });
      const arrivedIds = atPonte.map((row) => row.team_id);
      expect(arrivedIds).toContain(alpha!.id);
      expect(arrivedIds).toContain(epsilon!.id);
      expect(arrivedIds).not.toContain(delta!.id);
      expect(atPonte.find((row) => row.team_id === gama!.id)?.revealed_indication_ids).toHaveLength(
        world.hints.length,
      );
      // The vouched-for arrival is marked as such, not passed off as a GPS fix.
      expect(atPonte.find((row) => row.team_id === epsilon!.id)?.arrived_by_guide).toBe(true);
    } finally {
      // publicPage is deliberately left open — see its declaration.
      await Promise.all([
        guideAlphaPage.context().close(),
        guideEpsilonPage.context().close(),
        ...teamPages.map((page) => page.context().close()),
      ]);
    }
  });

  // ---------------------------------------------------------------------
  // FASE 3 — A TARDE: provas nos postos, com staff, coordenador e admin
  // ---------------------------------------------------------------------
  test("Tarde — o staff avalia as provas enquanto o coordenador acompanha e o admin premeia, tudo em simultâneo", async ({
    browser,
  }) => {
    const { cast, checkpoints, teams } = world;
    const [, mercado] = checkpoints;
    const [alpha, beta, gama, delta, epsilon] = teams;
    const staffMercado = cast.staff[0]!;

    const tokens = Object.fromEntries(
      await Promise.all(
        teams.map(async (team) => [team.id, await loginTeam(team.accessCode)] as const),
      ),
    ) as Record<number, string>;

    const staffPage = await newAuthedPage(browser, staffMercado.user);
    const managerPage = await newAuthedPage(browser, cast.manager.user);

    try {
      // Everyone converges on post 2. Delta arrives too: giving up on post 1
      // resolved it, so post 2 is legitimately its next post — the escape
      // hatch has to leave a team able to keep playing, or it is not an
      // escape at all.
      const arrivals = await Promise.all(
        teams.map((team) => arriveByGps(tokens[team.id]!, mercado!)),
      );
      for (const [index, arrival] of arrivals.entries()) {
        expect(arrival.status, `${teams[index]!.name} could not reach post 2`).toBe(200);
      }

      // --- The manager watches the whole route while the staff scores one --
      // `manager-rally` has its own cross-checkpoint evaluation page
      // (staff-evaluation/manager-only.tsx), which no fullstack spec had ever
      // rendered against a real backend. A staff member sees only their own
      // post; the coordinator sees every one of them.
      await staffPage.goto(`/rally/staff-evaluation/checkpoint/${mercado!.id}`);
      await Promise.all([
        evaluateOnPage(staffPage, alpha!.name),
        (async () => {
          await managerPage.goto("/rally/staff-evaluation");
          for (const checkpoint of checkpoints) {
            await expect(managerPage.getByText(checkpoint.name).first()).toBeVisible({
              timeout: 30_000,
            });
          }
        })(),
      ]);
      // Gama is scored exactly like Alpha — same post, same activity, same
      // result — so that the only thing separating their totals afterwards is
      // the two hints Gama bought in the morning.
      await evaluateOnPage(staffPage, gama!.name);
      for (const team of [beta!, delta!, epsilon!]) {
        await evaluateOnPage(staffPage, team.name);
      }

      // Every (team, activity) pair scored exactly once — no double write,
      // no lost write, under five back-to-back UI submissions.
      const allEvaluations = await apiCall<{
        evaluations: { team_id: number; activity_id: number }[];
      }>("GET", "/staff/all-evaluations", { token: cast.admin.user.accessToken });
      for (const team of teams) {
        expect(
          allEvaluations.evaluations.filter(
            (e) => e.team_id === team.id && e.activity_id === mercado!.activityId,
          ),
        ).toHaveLength(1);
      }

      // --- The coordinator signs up a walk-up team mid-event --------------
      // A real write by a real `manager-rally` token: the role's ABAC table
      // allows CREATE_TEAM resource-unscoped (app/core/abac.py), and nothing
      // in this suite had ever exercised a manager write at all.
      const walkUpName = `E2E Equipa Retardatária ${cast.runId}`;
      const walkUpTeam = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
        token: cast.manager.user.accessToken,
        body: { name: walkUpName },
      });
      expect(walkUpTeam.access_code).toBeTruthy();
      const teamsAfterWalkUp = await apiCall<{ id: number; name: string }[]>("GET", "/team/", {
        token: cast.manager.user.accessToken,
      });
      expect(teamsAfterWalkUp.some((t) => t.id === walkUpTeam.id)).toBe(true);

      // --- The admin hands out a prize the rules don't cover --------------
      // Every event has one. It lands on Beta so it cannot disturb the
      // Alpha-vs-Gama comparison the hint economy is measured by.
      await apiCall("POST", "/dynamic-awards", {
        token: cast.admin.user.accessToken,
        body: { team_id: beta!.id, points: DYNAMIC_AWARD_POINTS, reason: "melhor disfarce" },
      });

      // --- The board in the bar, still on the same page since this morning -
      if (!publicPage) throw new Error("the public scoreboard was never opened");
      const betaCard = publicPage.locator("a", { hasText: beta!.name });
      await expect(betaCard.getByText(/pts/)).not.toHaveText("0 pts", { timeout: 30_000 });
    } finally {
      await Promise.all([staffPage.context().close(), managerPage.context().close()]);
    }
  });

  // ---------------------------------------------------------------------
  // FASE 3.5 — O ÚLTIMO POSTO: uma porta fechada, um QR, e quem apareceu sem
  // estar inscrito
  // ---------------------------------------------------------------------
  test("Último posto — a Sé ainda não abriu, entra-se por QR, e o staff inscreve quem apareceu de repente", async ({
    browser,
  }) => {
    const { cast, checkpoints, teams } = world;
    const [, mercado, se] = checkpoints;
    const [alpha, beta, gama] = teams;
    const staffSe = cast.staff[1]!;

    const tokens = Object.fromEntries(
      await Promise.all(
        teams.map(async (team) => [team.id, await loginTeam(team.accessCode)] as const),
      ),
    ) as Record<number, string>;

    const adminPage = await newAuthedPage(browser, cast.admin.user);

    try {
      // --- The door isn't open yet ----------------------------------------
      // Alpha is standing at the right place with a valid fix, and is still
      // refused — and told when it opens, because a team at a closed door
      // already knows where the post is, so the hour is not worth redacting.
      const tooEarly = await arriveByGps(tokens[alpha!.id]!, se!);
      expect(tooEarly.status).toBe(400);
      expect(tooEarly.body).toContain("not open yet");

      // The organizer's escape hatch, reached through the real settings form:
      // faster than clearing the hours post by post when a place opens early.
      await adminPage.goto("/rally/settings");
      await adminPage.getByRole("button", { name: "Rota" }).click();
      await expect(adminPage.locator("#checkpoint_hours_enabled")).toBeChecked();
      await adminPage.locator("label:has(#checkpoint_hours_enabled)").click();
      await saveSettings(adminPage);
      await waitForSetting(cast.admin.user.accessToken, "checkpoint_hours_enabled", false);

      // Same team, same place, same fix — now let in. One call, not a poll:
      // an arrival is a write.
      const letIn = await arriveByGps(tokens[alpha!.id]!, se!);
      expect(letIn.status, letIn.body).toBe(200);

      // --- Beta arrives the other way: by scanning the post's QR -----------
      // The staff member at the post shows a rotating QR; the team scans it
      // and posts the token back. Nothing in this suite covered the token
      // path before, only the staff-scans-the-team direction.
      const { token: seToken } = await apiCall<{ token: string }>(
        "GET",
        `/checkpoint/checkin-token?checkpoint_id=${se!.id}`,
        { token: staffSe.user.accessToken },
      );
      expect(seToken).toBeTruthy();

      const scan = async (teamToken: string, token: string) => {
        const response = await fetch(`${API_V1}/checkpoint/check-in`, {
          method: "POST",
          headers: { Authorization: `Bearer ${teamToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        return { status: response.status, body: await response.text() };
      };

      const betaScan = await scan(tokens[beta!.id]!, seToken);
      expect(betaScan.status).toBe(200);
      expect(JSON.parse(betaScan.body).checkpoint_order).toBe(se!.order);

      // ...and the three ways that scan is meant to fail.
      // 1. A screenshot of someone else's scan, replayed by the same team:
      //    refused by the per-(token, team) nonce guard.
      expect((await scan(tokens[beta!.id]!, seToken)).status).toBe(409);
      // 2. A QR for a post the team is not up to yet — this is what stops a
      //    team photographing the last post's code and skipping the route.
      const { token: mercadoToken } = await apiCall<{ token: string }>(
        "GET",
        `/checkpoint/checkin-token?checkpoint_id=${mercado!.id}`,
        { token: cast.admin.user.accessToken },
      );
      const outOfOrder = await scan(tokens[gama!.id]!, mercadoToken);
      expect(outOfOrder.status).toBe(409);
      expect(outOfOrder.body).toContain("Out-of-order");
      // 3. A made-up token is not a token.
      expect((await scan(tokens[gama!.id]!, "not-a-real-token")).status).toBe(400);

      // And a staff member may not mint a QR for someone else's post — the
      // whole scheme rests on the code being issued at the post it names.
      const foreignMint = await fetch(
        `${API_V1}/checkpoint/checkin-token?checkpoint_id=${mercado!.id}`,
        { headers: { Authorization: `Bearer ${staffSe.user.accessToken}` } },
      );
      expect(foreignMint.status).toBe(403);

      // --- Someone turns up who never signed up ---------------------------
      // Walk-up registration is off by default, so the staff member at the
      // post is refused first — the gate is a real one, not a UI hint.
      const addMember = async (token: string, name: string) => {
        const response = await fetch(`${API_V1}/team/${alpha!.id}/members`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, email: null, is_captain: false }),
        });
        return { status: response.status, body: await response.text() };
      };

      const refused = await addMember(staffSe.user.accessToken, `Retardatário ${cast.runId}`);
      expect(refused.status).toBe(403);

      // The admin switches it on, in the real form, mid-event.
      await adminPage.getByRole("button", { name: "Equipas" }).click();
      await expect(adminPage.locator("#allow_staff_registration")).not.toBeChecked();
      await adminPage.locator("label:has(#allow_staff_registration)").click();
      await saveSettings(adminPage);
      await waitForSetting(cast.admin.user.accessToken, "allow_staff_registration", true);

      // Same staff member, same request, now allowed — and asked for exactly
      // once, because it creates a person.
      const walkUpName = `Retardatário ${cast.runId}`;
      const accepted = await addMember(staffSe.user.accessToken, walkUpName);
      expect(accepted.status, accepted.body).toBe(201);

      const members = await apiCall<{ name: string }[]>("GET", `/team/${alpha!.id}/members`, {
        token: cast.admin.user.accessToken,
      });
      // Exactly one, not "at least one": a retry that quietly added a second
      // walk-up would otherwise pass.
      expect(members.filter((member) => member.name === walkUpName)).toHaveLength(1);
    } finally {
      await adminPage.context().close();
    }
  });

  // ---------------------------------------------------------------------
  // FASE 4 — O APURAMENTO
  // ---------------------------------------------------------------------
  test("Apuramento — o que as ajudas custaram está no total de cada equipa, e o dia inteiro está no registo", async () => {
    const { cast, checkpoints, teams } = world;
    const [ponte] = checkpoints;
    const [alpha, beta, gama, delta, epsilon] = teams;

    // Read each team's stored total — the number `ScoringService.update_team_scores`
    // maintains, which is activity points *plus* active dynamic awards, and
    // therefore the only figure that reflects what help cost during the day.
    const totals = Object.fromEntries(
      await Promise.all(
        teams.map(async (team) => {
          const detail = await apiCall<{ id: number; total: number }>("GET", `/team/${team.id}`, {
            token: cast.admin.user.accessToken,
          });
          return [team.id, detail.total] as const;
        }),
      ),
    ) as Record<number, number>;
    const scoreOf = (teamId: number): number => totals[teamId]!;

    // The whole point of charging for help: Alpha and Gama walked the same
    // route and scored the same post identically, so the only thing between
    // their totals is the two hints Gama bought — at exactly the price the
    // admin saw in the settings form. An exact difference, not a "less than",
    // because a rounding or double-charge bug hides inside an inequality.
    expect(scoreOf(alpha!.id) - scoreOf(gama!.id)).toBe(
      Math.abs(BOOTSTRAPPED_HINT_PENALTY) * world.hints.length,
    );
    // Delta bought the same ladder as Gama and then gave up on top, so the
    // gap between those two is the give-up price alone — at the value the
    // organizer typed in phase 1, not the one the backend bootstrapped.
    expect(scoreOf(gama!.id) - scoreOf(delta!.id)).toBe(Math.abs(ORGANIZER_SKIP_PENALTY));
    // The team a guide vouched for is scored like any other — a manual
    // arrival is a different proof of presence, not a lesser one.
    expect(scoreOf(epsilon!.id)).toBe(scoreOf(alpha!.id));
    // The discretionary prize is on top of Beta's earned score.
    expect(scoreOf(beta!.id)).toBe(scoreOf(alpha!.id) + DYNAMIC_AWARD_POINTS);

    // The public board must agree with the team's own total, to the point.
    //
    // It did not, until this spec was written: `/scoreboard/live` is served
    // from `ScoringService._get_global_ranking`, which summed completed
    // activity results and never added dynamic awards the way
    // `update_team_scores` does. Every team here showed the same flat activity
    // score on the public board — the hints, the give-up and the prize all
    // invisible — while their own totals had them. A hint economy whose
    // charges never reach the standings is not an economy, so the ranking now
    // adds active awards and these two numbers are the same number.
    //
    // The reason the suite ran green past this for so long: the only
    // award-related check anywhere was `master-rally-day.spec.ts`'s
    // `total_score >= awardPoints`, which a 100-point activity satisfies on
    // its own whether or not the award ever counted. Hence equality here, for
    // every team, rather than a bound.
    // Polled, because this endpoint is served from a Redis leaderboard that
    // LeaderboardWorker rebuilds when a scoring event lands — the last write of
    // the day may not have reached it the instant the test asks.
    //
    // Exact equality is safe here because every score in this scenario is a
    // whole number (a 100-point boolean, and integer awards). `Team.total` is
    // rounded and the ranking total is not, so a fractional activity score —
    // a time-based ranking, say — would legitimately differ in the last
    // decimal; that is a separate divergence, and not one this spec creates
    // the conditions for.
    await expect
      .poll(
        async () => {
          const board = await apiCall<{ team_id: number; total_score: number }[]>(
            "GET",
            "/scoreboard/live",
            { token: cast.admin.user.accessToken },
          );
          return teams.map((team) => board.find((row) => row.team_id === team.id)?.total_score);
        },
        { timeout: 30_000 },
      )
      .toEqual(teams.map((team) => scoreOf(team.id)));

    // --- The day is in the audit trail ---------------------------------
    // The guide-vouched arrival in particular: it is the one progress write
    // with no GPS fix behind it, so the record of who vouched is the only
    // thing standing behind it if the result is ever questioned.
    const guideArrivals = await apiCall<
      { action: string; target_id: string; note: string | null; actor_name: string | null }[]
    >("GET", "/audit?action=checkin.guide_arrival&limit=100", {
      token: cast.admin.user.accessToken,
    });
    const epsilonArrival = guideArrivals.find(
      (entry) => entry.target_id === String(epsilon!.id) && entry.note?.includes(String(ponte!.id)),
    );
    expect(epsilonArrival).toBeDefined();
    expect(epsilonArrival!.actor_name).toBe(cast.guides[1]!.user.name);

    // The coordinator reads the same trail — `manager-rally` counts as admin
    // for this endpoint (deps.is_admin), which is what makes the role usable
    // as a co-organizer rather than a decoration.
    const managerAudit = await apiCall<{ action: string }[]>("GET", "/audit?limit=50", {
      token: cast.manager.user.accessToken,
    });
    expect(managerAudit.length).toBeGreaterThan(0);

    // --- The results leave the building ---------------------------------
    // Both exports are real file responses, so assert on the bytes rather
    // than on a JSON body that isn't there.
    const xlsx = await fetch(`${API_V1}/events/${world.eventId}/export`, {
      headers: { Authorization: `Bearer ${cast.admin.user.accessToken}` },
    });
    expect(xlsx.status).toBe(200);
    expect((await xlsx.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const pdf = await fetch(`${API_V1}/events/${world.eventId}/report`, {
      headers: { Authorization: `Bearer ${cast.admin.user.accessToken}` },
    });
    expect(pdf.status).toBe(200);
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    await publicPage?.context().close();
    publicPage = undefined;
  });
});
