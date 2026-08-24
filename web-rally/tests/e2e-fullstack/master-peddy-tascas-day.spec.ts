import fs from "node:fs";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { seedRealOidcSession, apiCall } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";
import { seedPeddyTascasCast, type PeddyTascasCast } from "./helpers/seedPeddyTascasCast";

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
  readonly eventName: string;
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

/**
 * Log a team in the way a team does on the day: typing the code from its
 * envelope into the form on somebody's phone.
 *
 * `check_login_rate_limit` is keyed per client IP and the whole suite shares
 * one runner IP, which is why this spec's stack raises
 * `TEAM_LOGIN_RATE_LIMIT_ATTEMPTS` (see `docker-compose.smoke.yml`, and this
 * directory's README). Twelve logins across the day is well inside it.
 */
async function teamLoginThroughForm(page: Page, accessCode: string): Promise<void> {
  await page.goto("/rally/team-login");
  await page.getByPlaceholder("XXXX-XXXX").fill(accessCode);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/team-progress", { timeout: 30_000 });
}

/** Open a phone, log a team into it, and hand back the page. */
async function teamPage(browser: Browser, team: BuiltTeam): Promise<Page> {
  const page = await newPage(browser);
  await teamLoginThroughForm(page, team.accessCode);
  return page;
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
 * Block until a just-saved switch reads back the same way on a fresh load.
 *
 * The API runs several uvicorn workers, so a settings write made through the
 * form is not necessarily visible to the next request that lands on a
 * different worker. Waiting on the *read* is the only safe way to bridge that;
 * polling the mutating call instead would retry the save. Reloading is the
 * read a person would do — and it asks the question the way the day does: is
 * the switch I flipped the switch everyone else now gets?
 */
async function waitForSettingToggle(
  page: Page,
  tab: string,
  inputId: string,
  checked: boolean,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole("button", { name: tab }).click({ timeout: 15_000 });
        return await page.locator(`#${inputId}`).isChecked({ timeout: 15_000 });
      },
      { timeout: 30_000 },
    )
    .toBe(checked);
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

/**
 * Reach a post the way a team does: standing there and pressing the button.
 *
 * Idempotent, because a successful press relabels the control to "Check-in
 * feito" — a retry that went looking for the actionable label again would
 * fail a check-in that had already landed. The name is anchored because the
 * route list carries a "Check-in GPS aqui" button for every other post a
 * free-choice stage leaves open, and this is about the main card's post.
 */
async function checkInWithGpsButton(page: Page): Promise<void> {
  const registered = page.getByText(/Posto concluído|Check-in registado|Já registado/);
  const button = page.getByRole("button", { name: /^(Check-in GPS|Tentar novamente)$/ });
  let attempt = 0;
  await expect(async () => {
    // Checked first, so the retry is idempotent: a successful press relabels
    // the button to "Check-in feito", and a retry that went looking for the
    // actionable label again would then never find it and fail a check-in
    // that had in fact already landed.
    if (await registered.isVisible().catch(() => false)) return;
    // From the second attempt on, reload before looking again. The card is
    // rendered from three queries (the team, the route, the settings), and a
    // hint purchase or another team's write can leave this page holding a
    // version of them in which `canCheckin` is false — no button at all,
    // rather than a button that fails. Reloading is what a person does, and
    // it is the only thing that clears that state.
    if (attempt++ > 0) {
      await page.reload();
      if (await registered.isVisible().catch(() => false)) return;
    }
    await button.click({ timeout: 5_000 });
    await expect(registered).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
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
        await expect(adminPage.getByText(checkpointNames[index]!).first()).toBeVisible({
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
      // Edit the first post to attach its details panel (activities, media, guide hints)
      await firstPostRow
        .locator("button:has(svg.lucide-square-pen, svg.lucide-edit, svg.lucide-pencil), button[aria-label*='Editar']")
        .first()
        .dispatchEvent("click");
      await expect(
        adminPage.getByText(`A configurar ${checkpoints[0]!.name}`).first(),
      ).toBeVisible({ timeout: 15_000 });

      for (const hint of hints) {
        await adminPage
          .getByPlaceholder("Indicação a dar à equipa (ex: Aponta para a estátua e pergunta…)")
          .fill(hint);
        await adminPage
          .getByPlaceholder("Pergunta (opcional)")
          .fill("Em que ano foi construída?");
        await adminPage.getByPlaceholder("Resposta esperada (opcional)").fill(expectedAnswer);
        await adminPage.getByRole("button", { name: "Adicionar indicação" }).click();
        await expect(adminPage.getByText(hint).first()).toBeVisible({ timeout: 15_000 });
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
        await expect(
          row.getByText(`Checkpoint: ${staffedCheckpoints[index]!.name}`),
        ).toBeVisible({ timeout: 15_000 });
      }

      await expect
        .poll(
          async () => {
            const staffAssignments = await apiCall<
              { user_email?: string; checkpoint_id?: number | null }[]
            >("GET", "/user/staff-assignments", { token: cast.admin.user.accessToken });
            return cast.staff.map(
              (m) => staffAssignments.find((a) => a.user_email === m.email)?.checkpoint_id ?? null,
            );
          },
          { timeout: 20_000 },
        )
        .toEqual(staffedCheckpoints.map((c) => c.id));

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
        await expect(row.getByText(`Equipa: ${guidedTeams[index]!.name}`)).toBeVisible({
          timeout: 15_000,
        });
      }

      await expect
        .poll(
          async () => {
            const guideAssignments = await apiCall<
              { user_email?: string; team_id?: number | null }[]
            >("GET", "/user/guide-assignments", { token: cast.admin.user.accessToken });
            return cast.guides.map(
              (g) => guideAssignments.find((a) => a.user_email === g.email)?.team_id ?? null,
            );
          },
          { timeout: 20_000 },
        )
        .toEqual(guidedTeams.map((t) => t.id));

      world = {
        cast,
        eventId: createdEvent.id,
        eventName,
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
    test.skip(!world, "Requer a execução da Fase 1 (Véspera) para criar o evento e o mundo");
    const { cast, checkpoints, teams } = world;
    const [ponte, mercado] = checkpoints;
    const [alpha, beta, gama, delta, epsilon] = teams;

    publicPage = await newPage(browser);
    const guideAlphaPage = await newAuthedPage(browser, cast.guides[0]!.user);
    const guideEpsilonPage = await newAuthedPage(browser, cast.guides[1]!.user);
    // Five phones, five envelopes, five codes typed in — at the same time,
    // which is also the only moment of the day when every team is doing the
    // same thing.
    const teamPages = await Promise.all(teams.map((team) => teamPage(browser, team)));
    const [alphaPage, betaPage, gamaPage, deltaPage] = teamPages;

    try {
      // The public scoreboard opens now and is never reloaded again. Every
      // later assertion on it can only be satisfied by a real SSE push.
      await publicPage.goto("/rally/scoreboard");
      await expect(publicPage.getByText(alpha.name)).toBeVisible({ timeout: 20_000 });

      // --- The route is a riddle, for everyone, at the same time ----------
      // Asserted on the page each team is actually holding, and on all five
      // at once: the riddle is there, and the answer — the post's name, its
      // coordinates, the key the guide reads from — is not, anywhere in the
      // document. `content()` covers what a curious participant would find in
      // the page source, not only what is painted.
      //
      // The redaction *rule* — which fields the payload may carry at which
      // point of the route — is asserted field by field where it lives, in
      // `app/tests/unit/services/test_checkpoint_redaction.py` and
      // `app/tests/api/test_checkpoint_reveal_on_arrival.py`.
      await Promise.all(
        teamPages.map(async (page) => {
          await page.goto("/rally/team-progress");
          await expect(page.getByText("Enigma")).toBeVisible({ timeout: 30_000 });
          await expect(page.getByText(ponte!.clue).first()).toBeVisible();
          const html = await page.content();
          expect(html).not.toContain(ponte!.name);
          expect(html).not.toContain(String(ponte!.latitude));
          expect(html).not.toContain(world.expectedAnswer);
        }),
      );

      // --- Alpha: solves it, and checks in through the real GPS button ----
      // Concurrently, its guide opens the guide view and reads the same
      // clue — unredacted, because a guide standing at the answer cannot
      // help a stuck team without knowing what it was asked.
      await standAt(alphaPage.context(), ponte!);
      await Promise.all([
        (async () => {
          await alphaPage.reload();
          // 6-decimal coordinates are rendered only once a post has been
          // revealed, so their absence is the same claim as the name's.
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
      // Two readings from two distances, taken the way a lost team takes
      // them: standing somewhere, pressing "Verificar distância", reading
      // what comes back. The far one must be a coarse band with no bearing —
      // a compass from 800 m away points straight at the answer — and the
      // near one may add it.
      const measure = async () => {
        await betaPage.getByRole("button", { name: "Verificar distância" }).click();
        await expect(betaPage.getByText("A medir…")).toHaveCount(0, { timeout: 20_000 });
      };

      await betaPage.goto("/rally/team-progress");
      await betaPage.context().grantPermissions(["geolocation"]);
      await betaPage.context().setGeolocation({
        latitude: ponte!.latitude + 0.0072,
        longitude: ponte!.longitude,
      });
      await measure();
      // The whole reading line, not just the band: the compass sector is
      // rendered inside this same paragraph, so an exact match is the
      // assertion that none was offered at this range.
      await expect(betaPage.locator("p", { hasText: "menos de 2km" })).toHaveText("menos de 2km", {
        timeout: 20_000,
      });
      // And the reply the card was drawn from carries no position either.
      expect(await betaPage.content()).not.toContain(String(ponte!.latitude));

      await betaPage.context().setGeolocation({
        latitude: ponte!.latitude - 0.0005,
        longitude: ponte!.longitude,
      });
      await measure();
      // Inside the closest band the puzzle is already solved; the compass
      // only helps find the door, so now it is on the same line.
      await expect(betaPage.locator("p", { hasText: "menos de 100m" })).toHaveText(
        /^menos de 100m\s*N$/,
        { timeout: 20_000 },
      );

      // Having narrowed it down, Beta walks in and presses check-in.
      await standAt(betaPage.context(), ponte!);
      await betaPage.goto("/rally/team-progress");
      await checkInWithGpsButton(betaPage);

      // --- Gama: can't solve it, buys the whole hint ladder ---------------
      // Through the UI, because the confirm dialog and the price shown to the
      // team are the part a team actually sees before spending points.
      await standAt(gamaPage.context(), ponte!);
      await buyEveryHint(gamaPage);
      // The answer key behind those hints still never reaches the team.
      expect(await gamaPage.content()).not.toContain(world.expectedAnswer);

      // What those hints cost is settled in phase 4, on the public board,
      // where it is a number a participant can read. That it is charged once
      // per rung and never twice is asserted in
      // `app/tests/api/test_checkpoint_hints.py::test_penalty_is_charged_once_per_hint`.

      // With the ladder spent, Gama finally finds it — on the same screen it
      // just bought the hints from.
      await checkInWithGpsButton(gamaPage);

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
      // riddle instead — on the same screen the button was pressed from, with
      // no reload, because a team that gives up is looking at the phone.
      await expect(deltaPage.getByText(mercado!.clue).first()).toBeVisible({ timeout: 30_000 });
      // And the place it never found is finally named. Giving up *resolves*
      // the post (`_redact_unreached` reveals a resolved one just as it does
      // an arrival), which is the humane behaviour: a team that paid to stop
      // looking is told what it was looking for instead of walking away with
      // the riddle unanswered.
      await expect(deltaPage.getByText(ponte!.name).first()).toBeVisible({ timeout: 20_000 });
      // What the forfeit cost is settled in phase 4. That it is charged once
      // and only once is
      // `app/tests/api/test_checkpoint_skip.py::test_the_forfeit_is_charged_once`.

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

      // --- The guide's record of the morning, on the guide's own screen ---
      // Before vouching for anyone, the panel already carries the morning: who
      // turned up at this post, and — the part that matters standing there —
      // which of them paid for hints, so the guide does not read one out for
      // free seconds after a team bought it.
      //
      // This has to be asserted *now*: the panel renders only on the guide's
      // team's current post (`cp.is_current`, and the server 403s on any
      // other), so the moment Epsilon's arrival completes post 1 the whole
      // record scrolls out of the guide's reach.
      // Scoped to the arrived list, not to the panel: the same section also
      // holds the "who else is still coming" dropdown, whose options carry
      // every team's name including the ones that have not turned up.
      const arrivedHere = guideEpsilonPage
        .locator("section", { has: guideEpsilonPage.getByText("Equipas neste posto") })
        .locator("ul");
      for (const team of [alpha!, beta!, gama!]) {
        await expect(arrivedHere.getByText(team.name, { exact: true })).toBeVisible({
          timeout: 20_000,
        });
      }
      // Delta gave up rather than arriving: a forfeit is not a visit, and a
      // guide who saw it listed as *here* would be looking around for a team
      // that is already two streets away.
      await expect(arrivedHere.getByText(delta!.name, { exact: true })).toHaveCount(0);
      await expect(arrivedHere.getByText(`${world.hints.length} pistas já compradas`)).toBeVisible();

      await arrivalSelect.selectOption({ label: epsilon!.name });
      await guideEpsilonPage.getByRole("button", { name: "Marcar chegada" }).click();
      // Post 1 has no activity, so vouching for the arrival *completes* it and
      // Epsilon's current post becomes 2 — which unmounts this whole panel.
      // So the row this click created is gone from the screen a moment after
      // it appears, and the durable UI consequence to assert is the narrower
      // one: the team is no longer offered as still-pending. That the arrival
      // is stored as vouched-for rather than passed off as a GPS fix is
      // `app/tests/api/test_guide_field_tools.py::test_lists_arrivals_with_the_hints_the_team_bought`.
      await expect(guideEpsilonPage.getByRole("option", { name: epsilon!.name })).toHaveCount(0, {
        timeout: 20_000,
      });

      // --- Everyone who reached post 1 has it revealed and the next riddle --
      // On each team's own phone, which is the only place this matters: the
      // place they found is now named, and the next riddle has replaced it.
      // Delta is excluded on purpose — giving up resolves a post without ever
      // revealing it, which is the whole difference between the two exits, and
      // it was asserted at the moment it happened.
      for (const [index, team] of teams.entries()) {
        if (team.id === delta!.id) continue;
        const page = teamPages[index]!;
        await expect(async () => {
          await page.reload();
          await expect(page.getByText(mercado!.clue).first()).toBeVisible({ timeout: 10_000 });
          await expect(page.getByText(ponte!.name).first()).toBeVisible({ timeout: 10_000 });
        }).toPass({ timeout: 30_000 });
        // The post they have not reached yet is still a riddle — one post
        // revealed is not the route revealed.
        expect(await page.content()).not.toContain(mercado!.name);
      }

      // A post nobody has reached is still sealed: its photos would give the
      // place away as surely as its coordinates. Asserted at the payload level
      // in `test_checkpoint_reveal_on_arrival.py`, because there is nothing to
      // click — a sealed gallery is a gallery that is not on the page.
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
    test.skip(!world, "Requer a execução da Fase 1 (Véspera) para criar o evento e o mundo");
    const { cast, checkpoints, teams } = world;
    const [, mercado] = checkpoints;
    const [alpha, beta, gama, delta, epsilon] = teams;
    const staffMercado = cast.staff[0]!;

    const staffPage = await newAuthedPage(browser, staffMercado.user);
    const managerPage = await newAuthedPage(browser, cast.manager.user);
    const teamPages = await Promise.all(teams.map((team) => teamPage(browser, team)));
    for (const page of teamPages) {
      await standAt(page.context(), mercado!);
    }

    try {
      // Everyone converges on post 2. Delta arrives too: giving up on post 1
      // resolved it, so post 2 is legitimately its next post — the escape
      // hatch has to leave a team able to keep playing, or it is not an
      // escape at all.
      await Promise.all(
        teamPages.map(async (page) => {
          await page.goto("/rally/team-progress");
          await checkInWithGpsButton(page);
        }),
      );

      // --- The manager watches the whole route while the staff scores one --
      // `manager-rally` has its own cross-checkpoint evaluation page
      // (staff-evaluation/manager-only.tsx), which no fullstack spec had ever
      // rendered against a real backend. A staff member sees only their own
      // post; the coordinator sees every one of them.
      // The way a staff member gets there: open the app, land on your own
      // post. No id typed, because none is ever shown to them.
      await staffPage.goto("/rally/staff-evaluation");
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

      // Every team scored exactly once — no double write, no lost write,
      // under five back-to-back submissions on the same screen. Read off the
      // post's own counter, which is the number the person running the post
      // is watching, and off the "já avaliadas" list, which is where a team
      // that was scored twice would show up twice.
      await expect(staffPage.getByText(`${teams.length}/${teams.length}`)).toBeVisible({
        timeout: 30_000,
      });
      // And the queue is empty: the "Em <posto>" section renders only while
      // there is somebody left to score, so its absence is the post's own
      // statement that it is done.
      await expect(staffPage.getByText(`Em ${mercado!.name}`)).toHaveCount(0);
      await expect(staffPage.getByText("Já avaliadas")).toBeVisible();

      // --- The coordinator signs up a walk-up team mid-event --------------
      // A real write by a real `manager-rally` session, through the form the
      // coordinator would actually use: the role's ABAC table allows
      // CREATE_TEAM resource-unscoped (app/core/abac.py), and nothing in this
      // suite had ever exercised a manager write at all.
      const walkUpName = `E2E Equipa Retardatária ${cast.runId}`;
      await managerPage.goto("/rally/admin?tab=teams");
      await managerPage.getByPlaceholder("Ex: Equipa Alpha").fill(walkUpName);
      await managerPage.getByRole("button", { name: /^Criar Equipa$/ }).click();
      // The modal is the only place the app ever shows an access code, so it
      // is also the only way the coordinator could hand one over at the door.
      await expect(managerPage.getByText("Equipa Criada!")).toBeVisible({ timeout: 20_000 });
      await expect(managerPage.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)).toBeVisible();
      await managerPage.getByRole("button", { name: "Concluir" }).click();
      await expect(managerPage.getByText(walkUpName)).toBeVisible({ timeout: 20_000 });

      // --- The admin hands out a prize the rules don't cover --------------
      // Every event has one. It lands on Beta so it cannot disturb the
      // Alpha-vs-Gama comparison the hint economy is measured by — and it is
      // typed into the same form an organizer uses at two in the morning.
      const adminPage = await newAuthedPage(browser, cast.admin.user);
      try {
        await adminPage.goto("/rally/admin?tab=scoring");
        await adminPage.getByRole("button", { name: "Novo prémio" }).click();
        await adminPage
          .locator('label[data-admin-search-key="award_team"] select')
          .selectOption({ label: beta!.name });
        await adminPage
          .locator('label[data-admin-search-key="award_points"] input')
          .fill(String(DYNAMIC_AWARD_POINTS));
        // Run-scoped, because the disposable Postgres keeps every previous
        // run's awards and the tab lists them all: a bare "melhor disfarce"
        // matches seventeen rows and none of them is this one.
        const awardReason = `melhor disfarce ${cast.runId}`;
        await adminPage
          .locator('label[data-admin-search-key="award_reason"] input')
          .fill(awardReason);
        await adminPage.getByRole("button", { name: /^Criar$/ }).click();
        await expect(adminPage.getByText(awardReason)).toBeVisible({ timeout: 20_000 });
      } finally {
        await adminPage.context().close();
      }

      // --- The board in the bar, still on the same page since this morning -
      if (!publicPage) throw new Error("the public scoreboard was never opened");
      const betaCard = publicPage.locator("a", { hasText: beta!.name });
      await expect(betaCard.getByText(/pts/)).not.toHaveText("0 pts", { timeout: 30_000 });
    } finally {
      await Promise.all([
        staffPage.context().close(),
        managerPage.context().close(),
        ...teamPages.map((page) => page.context().close()),
      ]);
    }
  });

  // ---------------------------------------------------------------------
  // FASE 3.5 — O ÚLTIMO POSTO: uma porta ainda fechada
  // ---------------------------------------------------------------------
  test("Último posto — a Sé ainda não abriu, e o organizador abre-a a meio do dia", async ({
    browser,
  }) => {
    test.skip(!world, "Requer a execução da Fase 1 (Véspera) para criar o evento e o mundo");
    const { cast, checkpoints, teams } = world;
    const [, , se] = checkpoints;
    const [alpha, beta] = teams;

    const adminPage = await newAuthedPage(browser, cast.admin.user);
    const alphaPage = await newPage(browser);
    const betaPage = await newPage(browser);
    await teamLoginThroughForm(alphaPage, alpha!.accessCode);
    await teamLoginThroughForm(betaPage, beta!.accessCode);
    await standAt(alphaPage.context(), se!);
    await standAt(betaPage.context(), se!);

    try {
      // --- The door isn't open yet ----------------------------------------
      // Alpha is standing at the right place with a valid fix, and the app
      // does not even offer the button: it reads the post's window itself and
      // says when it opens. That is the difference between "the app is
      // broken" and "come back at ten" — and a team at a closed door already
      // knows where the post is, so the hour is not worth redacting.
      await alphaPage.goto("/rally/team-progress");
      await expect(alphaPage.getByText(/ainda não abriu\. Abre às \d{2}:\d{2}/)).toBeVisible({
        timeout: 20_000,
      });
      await expect(alphaPage.getByRole("button", { name: /^Check-in GPS$/ })).toHaveCount(0);

      // The organizer's escape hatch, reached through the real settings form:
      // faster than clearing the hours post by post when a place opens early.
      await adminPage.goto("/rally/settings");
      await adminPage.getByRole("button", { name: "Rota" }).click();
      await expect(adminPage.locator("#checkpoint_hours_enabled")).toBeChecked();
      await adminPage.locator("label:has(#checkpoint_hours_enabled)").click();
      await saveSettings(adminPage);
      await waitForSettingToggle(adminPage, "Rota", "checkpoint_hours_enabled", false);

      // Same teams, same place — and now the app offers the button, because
      // the notice reads the event's switch rather than the post's window
      // alone. Without that the organizer's escape hatch worked on the server
      // and nowhere else: check-ins were being accepted while every team still
      // saw "ainda não abriu" and had nothing to press.
      //
      // Both teams press at once, from two phones, the way a queue at a door
      // that has just opened actually behaves.
      await Promise.all(
        [alphaPage, betaPage].map(async (page) => {
          await page.goto("/rally/team-progress");
          await expect(page.getByText(/ainda não abriu/)).toHaveCount(0);
          await checkInWithGpsButton(page);
        }),
      );

      // The staff member at the door sees both of them arrive on their own
      // screen — the arrival is only real once the person running the post
      // can act on it.
      const staffPage = await newAuthedPage(browser, cast.staff[1]!.user);
      try {
        await staffPage.goto("/rally/staff-evaluation");
        await expect(staffPage.getByText(se!.name)).toBeVisible({ timeout: 30_000 });
        for (const team of [alpha!, beta!]) {
          await expect(staffPage.getByText(team.name).first()).toBeVisible({ timeout: 30_000 });
        }
      } finally {
        await staffPage.context().close();
      }
    } finally {
      await Promise.all([
        adminPage.context().close(),
        alphaPage.context().close(),
        betaPage.context().close(),
      ]);
    }
  });

  // ---------------------------------------------------------------------
  // FASE 4 — O APURAMENTO
  // ---------------------------------------------------------------------
  test("Apuramento — o que as ajudas custaram está no total de cada equipa, e o dia inteiro está no registo", async ({
    browser,
  }) => {
    test.skip(!world, "Requer a execução da Fase 1 (Véspera) para criar o evento e o mundo");
    const { cast, teams } = world;
    const [alpha, beta, gama, delta, epsilon] = teams;

    const adminPage = await newAuthedPage(browser, cast.admin.user);
    const boardPage = await newPage(browser);
    try {
      // --- Every total, twice, from the two screens that show one --------
      // The team's own detail page renders `Team.total` — the number
      // `ScoringService.update_team_scores` maintains, activity points plus
      // active dynamic awards. The public board renders the ranking total,
      // built separately by `_get_global_ranking`. Reading both is the point:
      // they are two different computations of the same claim, and the day is
      // only settled if they agree.
      const boardTotal = async (name: string): Promise<number> => {
        const card = boardPage.locator("a", { hasText: name }).first();
        const text = await card.innerText();
        const match = /(-?\d+)\s*pts/.exec(text);
        expect(match, `no points shown on the board for ${name}`).not.toBeNull();
        return Number(match![1]);
      };
      const ownTotal = async (teamId: number): Promise<number> => {
        await adminPage.goto(`/rally/teams/${teamId}`);
        const text = await adminPage
          .locator("p", { hasText: /^-?\d+\s*pts$/ })
          .first()
          .innerText();
        return Number(/(-?\d+)/.exec(text)![1]);
      };

      await boardPage.goto("/rally/scoreboard");
      await expect(boardPage.getByText(alpha!.name)).toBeVisible({ timeout: 30_000 });

      const totals: Record<number, number> = {};
      for (const team of teams) {
        totals[team.id] = await ownTotal(team.id);
      }
      const scoreOf = (teamId: number): number => totals[teamId]!;

      // The whole point of charging for help: Alpha and Gama walked the same
      // route and scored the same post identically, so the only thing between
      // their totals is the hints Gama bought — at exactly the price the admin
      // saw in the settings form. An exact difference, not a "less than",
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

      // The board in the bar must show the same numbers, to the point.
      //
      // It did not, until this spec was written: the live ranking summed
      // completed activity results and never added dynamic awards the way
      // `update_team_scores` does, so every team here showed the same flat
      // activity score in public — the hints, the give-up and the prize all
      // invisible — while their own totals had them. A hint economy whose
      // charges never reach the standings is not an economy.
      //
      // The reason the suite ran green past this for so long: the only
      // award-related check anywhere was `master-rally-day.spec.ts`'s
      // `total_score >= awardPoints`, which a 100-point activity satisfies on
      // its own whether or not the award ever counted. Hence equality here,
      // for every team, rather than a bound.
      //
      // Polled with a reload, because the board is served from a Redis
      // leaderboard that LeaderboardWorker rebuilds when a scoring event
      // lands: the last write of the day may not have reached it the instant
      // the test looks.
      await expect
        .poll(
          async () => {
            await boardPage.reload();
            const shown: number[] = [];
            for (const team of teams) shown.push(await boardTotal(team.name));
            return shown;
          },
          { timeout: 30_000 },
        )
        .toEqual(teams.map((team) => scoreOf(team.id)));

      // --- The day is in the audit trail ---------------------------------
      // The guide-vouched arrival in particular: it is the one progress write
      // with no GPS fix behind it, so the record of who vouched is the only
      // thing standing behind it if the result is ever questioned. Read on
      // the organizer's own Auditoria tab, filtered the way an organizer
      // would filter it.
      await adminPage.goto("/rally/admin?tab=audit");
      await adminPage.getByRole("combobox").first().click();
      await adminPage.getByRole("option", { name: "Check-ins" }).click();
      const arrivalRow = adminPage
        .locator("div.rounded-lg")
        .filter({ hasText: "checkin.guide_arrival" })
        // The target is what makes the row this run's: the guide's display
        // name is not unique across runs against a long-lived database.
        .filter({ hasText: `team#${epsilon!.id}` })
        .first();
      await expect(arrivalRow).toBeVisible({ timeout: 30_000 });
      await expect(arrivalRow).toContainText(cast.guides[1]!.user.name);

      // The coordinator reads the same trail — `manager-rally` counts as admin
      // for this endpoint (deps.is_admin), which is what makes the role usable
      // as a co-organizer rather than a decoration.
      const managerPage = await newAuthedPage(browser, cast.manager.user);
      try {
        await managerPage.goto("/rally/admin?tab=audit");
        await expect(managerPage.getByText("Sem registos para os filtros atuais.")).toHaveCount(0, {
          timeout: 30_000,
        });
        await expect(managerPage.locator("div.rounded-lg").first()).toBeVisible();
      } finally {
        await managerPage.context().close();
      }

      // --- The results leave the building ---------------------------------
      // Both exports are real files, downloaded by pressing the buttons on the
      // Edições tab — which is the only way anyone ever gets them.
      await adminPage.goto("/rally/admin?tab=events");
      const eventCard = adminPage.locator(".rally-surface", { hasText: world.eventName }).first();
      for (const [button, extension] of [
        ["Exportar resultados", ".xlsx"],
        ["Relatório (PDF)", ".pdf"],
      ] as const) {
        const downloadPromise = adminPage.waitForEvent("download", { timeout: 60_000 });
        await eventCard.getByRole("button", { name: button }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain(extension);
        const path = await download.path();
        expect(path, `${button} produced no file`).toBeTruthy();
        expect(fs.statSync(path!).size).toBeGreaterThan(0);
      }
    } finally {
      await Promise.all([adminPage.context().close(), boardPage.context().close()]);
    }
  });

  test.afterAll(async () => {
    await publicPage?.context().close();
    publicPage = undefined;
  });
});
