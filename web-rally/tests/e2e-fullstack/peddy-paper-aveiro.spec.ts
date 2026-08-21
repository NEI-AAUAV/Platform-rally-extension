import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { seedRealOidcSession, apiCall, API_V1 } from "./helpers/fullstackAuth";
import { waitForApi } from "./helpers/seedRally";
import { seedPeddyTascasCast, loginTeam } from "./helpers/seedPeddyTascasCast";
import {
  AVEIRO_POSTS,
  AVEIRO_STAGES,
  FORA_DA_UNI_POSTS,
  UNIVERSIDADE_POSTS,
  type AveiroPost,
} from "./helpers/aveiroEvent";

/**
 * A real past edition: the NEI peddy paper through Aveiro, rebuilt from the
 * organizers' own planning sheet and then run.
 *
 * `master-peddy-tascas-day.spec.ts` covers a day whose route was invented to
 * exercise the mode. This one is the opposite: the route is fixed by what
 * actually happened, and the test has to cope with whatever that route needs.
 * That turns out to be a much harder brief, because a real plan uses the
 * corners of the product a synthetic one never reaches:
 *
 *  - Every post carries three separate texts — what the person stationed
 *    there talks about, the clue that gets a team there, and the challenge
 *    once they arrive (`staff_script` / `clue` / `challenge_brief`). Nothing
 *    in this suite had ever filled the first and third.
 *  - The route is in two blocks with different rules: the university posts in
 *    order, the ones outside as a set where three of four are enough. That is
 *    `RouteStage`, previously listed in this directory's README as untested.
 *  - One venue was still undecided ("CF DECIDE") — a provisional name teams
 *    must not see, which is `is_draft` + `is_placeholder`, and which the
 *    backend refuses to change once teams have started.
 *  - The challenges are not all the same shape. A ball at a goal is pass/fail
 *    but counts misses; questions in pairs are scored; a pyramid and a line of
 *    shots is against the clock; "mais criativo recebe uma salva de palmas"
 *    cannot be judged at the post at all — it needs every team's attempt
 *    first. Those are four different activity types and two penalty counters.
 *
 * And it is run the way a real one runs: the guides, the teams and the staff
 * evaluations all happening at the same time, not in turns.
 */

test.describe.configure({ mode: "serial" });

const TEAM_NAMES = ["Moliceiros", "Ovos Moles", "Salineiros", "Tunos"] as const;

/**
 * Which config key each of the admin form's type-specific inputs writes to
 * (ActivityConfigFields). Spelled out rather than derived, so that a form that
 * quietly points its "Pontos Máximos" box at the wrong key fails here.
 */
const CONFIG_KEY_BY_FIELD_ID: Readonly<Record<string, string>> = {
  "config-bool-success": "success_points",
  "config-bool-failure": "failure_points",
  "config-sb-max-points": "max_points",
  "config-sb-base-score": "base_score",
  "config-tb-max-points": "max_points",
  "config-tb-min-points": "min_points",
  "config-gen-min-points": "min_points",
  "config-gen-max-points": "max_points",
  "config-gen-default-points": "default_points",
  "config-dj-min-points": "min_points",
  "config-dj-max-points": "max_points",
};
const ARRIVAL_RADIUS_M = 80;

interface BuiltPost extends AveiroPost {
  readonly id: number;
  readonly fullName: string;
  readonly order: number;
  readonly activityId: number;
}

interface BuiltTeam {
  readonly id: number;
  readonly name: string;
  readonly accessCode: string;
}

interface AveiroWorld {
  readonly cast: Awaited<ReturnType<typeof seedPeddyTascasCast>>;
  readonly eventId: number;
  readonly stageIds: readonly number[];
  readonly posts: readonly BuiltPost[];
  readonly teams: readonly BuiltTeam[];
}

let world: AveiroWorld;

function postByKey(key: string): BuiltPost {
  const post = world.posts.find((p) => p.key === key);
  if (!post) throw new Error(`post ${key} was never built`);
  return post;
}

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

async function standAt(context: BrowserContext, post: BuiltPost) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: post.latitude, longitude: post.longitude });
}

async function arriveByGps(teamToken: string, post: BuiltPost) {
  const response = await fetch(`${API_V1}/checkpoint/${post.id}/arrive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${teamToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ latitude: post.latitude, longitude: post.longitude }),
  });
  return { status: response.status, body: await response.text() };
}

/**
 * Flip a switch inside the admin checkpoint form.
 *
 * The visible control is a styled <label> wrapping a visually-hidden checkbox
 * (components/ui/switch.tsx), and the checkbox's id is generated by shadcn's
 * form context rather than taken from the field name — so the row's
 * `data-admin-search-key` is what identifies it.
 */
async function toggleFormSwitch(page: Page, searchKey: string): Promise<void> {
  const row = page.locator(`[data-admin-search-key="${searchKey}"]`);
  const checkbox = row.locator('input[type="checkbox"]');
  const before = await checkbox.isChecked();
  // The label that *wraps* the input, not the row's caption label — clicking
  // the wrapper is what a person does, and it works whether or not the
  // generated id and htmlFor happen to line up.
  await row.locator('label:has(input[type="checkbox"])').click();
  await expect(checkbox).toBeChecked({ checked: !before });
}

/**
 * Open one team's evaluation at the staff's post and return the open form.
 *
 * The staff screen lists the teams waiting at the post; picking one and
 * pressing "Avaliar" is what a staff member does between challenges.
 */
async function openEvaluation(page: Page, teamName: string): Promise<void> {
  await page.getByText(teamName).first().click();
  // Retried as a unit: the warning dialog renders a tick after the team is
  // opened, so a one-shot "is it there?" check races it and the click that
  // follows is then intercepted by an overlay that appeared in between.
  await expect(async () => {
    await dismissIncompleteWarning(page);
    await page
      .getByRole("button", { name: /avaliar|evaluate/i })
      .first()
      .click({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Clear the "Avaliações incompletas detetadas" dialog if it is up.
 *
 * It fires when the team being opened belongs to a different post than the one
 * the staff member is standing at — which, in a free-choice block, is the
 * normal case rather than an error: the teams fan out, so whoever is at the
 * Faina is routinely handed a team whose "current" post is the Museu. The
 * dialog is a full-screen overlay, so until it is closed every click on the
 * page underneath is intercepted.
 */
async function dismissIncompleteWarning(page: Page): Promise<void> {
  const warning = page.getByText("Avaliações incompletas detetadas");
  if (await warning.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(warning).toBeHidden({ timeout: 15_000 });
  }
}

const SUBMIT_EVALUATION = /submit evaluation|submeter avaliação|atualizar avaliação/i;

/**
 * Finish an evaluation and wait for the toast that means the POST landed.
 *
 * Matched exactly: a looser "avaliad[ao]" also matches the "Já avaliadas"
 * heading that appears as soon as any team at this post has been scored, so it
 * would pass whether or not this submission worked. `.first()` because
 * consecutive submissions stack toasts faster than each one's dismiss timer.
 */
async function submitEvaluation(page: Page): Promise<void> {
  await page.getByRole("button", { name: SUBMIT_EVALUATION }).click();
  await expect(page.getByText("Atividade avaliada com sucesso!").first()).toBeVisible({
    timeout: 20_000,
  });
  await dismissIncompleteWarning(page);
  await page.getByText("Voltar às equipas").click();
}

/**
 * Type a count into one of the activity's custom miss counters.
 *
 * These are the "cada falha bebe" counters configured per activity; the input
 * is labelled "Contagem de {label}" (PenaltiesFieldset), which is the only
 * stable handle on a control whose id is derived from a slug of the label.
 */
async function setPenaltyCount(page: Page, counterLabel: string, count: number): Promise<void> {
  await page.getByLabel(`Contagem de ${counterLabel}`).fill(String(count));
}

async function evaluateBoolean(
  page: Page,
  teamName: string,
  options: { success: boolean; counterLabel: string; count: number },
): Promise<void> {
  await openEvaluation(page, teamName);
  if (options.success) {
    // BooleanForm's success control is a visually-hidden checkbox under a
    // styled label — the label is the clickable thing.
    await page.getByText("Equipa teve sucesso na atividade").first().click();
  }
  await setPenaltyCount(page, options.counterLabel, options.count);
  await submitEvaluation(page);
}

async function evaluateScoreBased(
  page: Page,
  teamName: string,
  options: { score: number; counterLabel: string; count: number },
): Promise<void> {
  await openEvaluation(page, teamName);
  await page.locator("#score-achieved").fill(String(options.score));
  await setPenaltyCount(page, options.counterLabel, options.count);
  await submitEvaluation(page);
}

async function evaluateTimeBased(page: Page, teamName: string, seconds: number): Promise<void> {
  await openEvaluation(page, teamName);
  await page.locator("#timebased-completion-time").fill(String(seconds));
  await submitEvaluation(page);
}

async function evaluateGeneral(page: Page, teamName: string, points: number): Promise<void> {
  await openEvaluation(page, teamName);
  await page.locator("#general-points").fill(String(points));
  await submitEvaluation(page);
}

/**
 * Log a team in the way a team actually does: typing its access code into the
 * form on the phone.
 *
 * Kept for the teams that are proving the login screen works. The rest get a
 * seeded session instead, because `check_login_rate_limit` is keyed per client
 * IP rather than per access code (see this directory's README) and the whole
 * suite shares one runner IP.
 */
async function teamLoginThroughForm(page: Page, accessCode: string): Promise<void> {
  await page.goto("/rally/team-login");
  await page.getByPlaceholder("XXXX-XXXX").fill(accessCode);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/team-progress");
}

/**
 * Reach a post the way a team does: standing there and pressing the button.
 *
 * Retried as a whole because the geolocation-gated check-in can come back as a
 * transient error while the rest of the suite is hammering the same backend,
 * and because the button relabels itself between states ("Check-in GPS" →
 * "Tentar novamente") — so the retry has to re-find it rather than hold a
 * stale handle.
 */
async function checkInWithGpsButton(page: Page): Promise<void> {
  const registered = page.getByText(/Posto concluído|Check-in registado|Já registado/);
  await expect(async () => {
    // Checked first, so the retry is idempotent: a successful press relabels
    // the button to "Check-in feito", and a retry that went looking for the
    // actionable label again would then never find it and fail a check-in
    // that had in fact already landed.
    if (await registered.isVisible().catch(() => false)) return;
    await page
      .getByRole("button", { name: /Check-in GPS|Tentar novamente/ })
      .click({ timeout: 5_000 });
    await expect(registered).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
}

/**
 * Walk a team to whichever post the app is currently offering, and check in
 * there by pressing the button.
 *
 * The post is read from the team's own progress rather than chosen by the
 * test, because that is the only post the participant screen will let them
 * check into — `NextCheckpointCard` renders one "próximo posto" and nothing
 * else on the page can register an arrival.
 */
async function walkToPostAndCheckIn(
  page: Page,
  teamId: number,
  target: BuiltPost,
  adminToken: string,
): Promise<void> {
  // Waits for the app to actually be offering this post before standing at
  // it. Scoring a challenge is what advances a team, and that lands
  // asynchronously — pressing check-in before it does would register at the
  // post the team is already standing on, succeed, and quietly leave the team
  // one post behind for the rest of the phase.
  await expect
    .poll(
      async () =>
        (
          await apiCall<{ current_checkpoint_number: number }>("GET", `/team/${teamId}`, {
            token: adminToken,
          })
        ).current_checkpoint_number,
      { timeout: 30_000 },
    )
    .toBe(target.order);

  await standAt(page.context(), target);
  await page.goto("/rally/team-progress");
  await checkInWithGpsButton(page);
}

/** See master-peddy-tascas-day.spec.ts — the save bar exists only while dirty. */
async function saveSettings(page: Page): Promise<void> {
  const save = page.getByRole("button", { name: "Guardar" });
  await save.click({ timeout: 15_000 });
  await expect(save).toBeHidden({ timeout: 15_000 });
}

test.describe("Peddy paper de Aveiro — a edição que já aconteceu", () => {
  test.setTimeout(900_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  // ---------------------------------------------------------------------
  // PLANEAMENTO — a folha de planeamento, transcrita para a aplicação
  // ---------------------------------------------------------------------
  test("Planeamento — a organização passa a folha do peddy paper para a app, etapa a etapa", async ({
    browser,
  }) => {
    const cast = await seedPeddyTascasCast({ staffCount: AVEIRO_POSTS.length, guideCount: 2 });
    const { runId } = cast;
    const adminPage = await newAuthedPage(browser, cast.admin.user);

    try {
      // --- The edition ----------------------------------------------------
      const eventName = `Peddy Paper Aveiro ${runId}`;
      await adminPage.goto("/rally/admin?tab=events");
      await adminPage.getByRole("button", { name: "Novo" }).click();
      await adminPage.locator("#ev-name").fill(eventName);
      await adminPage.locator("#ev-type").click();
      await adminPage.getByRole("option", { name: "Peddy-paper" }).click();
      await adminPage.getByRole("button", { name: /^Criar$/ }).click();
      await expect(adminPage.getByText(eventName)).toBeVisible({ timeout: 15_000 });

      const events = await apiCall<{ id: number; name: string; is_current: boolean }[]>(
        "GET",
        "/events",
        { token: cast.admin.user.accessToken },
      );
      const event = events.find((e) => e.name === eventName);
      expect(event).toBeDefined();
      if (!event) throw new Error("unreachable");
      if (!event.is_current) {
        const card = adminPage.locator(".rally-surface", { hasText: eventName });
        await card.getByRole("button", { name: "Tornar atual" }).click();
        await expect(card.getByText("Atual", { exact: true })).toBeVisible({ timeout: 15_000 });
      }

      // --- What the bar screen shows ---------------------------------------
      // A peddy-paper edition bootstraps its standings hidden, which is the
      // right default for a route whose whole point is not knowing where
      // anyone is. This edition ran with a public board, so that is a
      // deliberate switch — and without it the anonymous viewer later in this
      // spec sees an empty page.
      await adminPage.goto("/rally/settings");
      await adminPage.getByRole("button", { name: "Visualização" }).click();
      await adminPage.locator("#show_score_mode").click();
      await adminPage.getByRole("option", { name: "Classificação completa" }).click();
      await saveSettings(adminPage);
      // Stages exist as data whether or not their rules are enforced: with the
      // switch off the whole route runs as one block under
      // checkpoint_order_matters, and the two blocks are just labels. This
      // route is the reason the feature exists — the university posts in
      // order, the ones outside as a set — so it goes on.
      await adminPage.getByRole("button", { name: "Rota" }).click();
      await adminPage.locator("label:has(#route_stages_enabled)").click();
      await saveSettings(adminPage);

      const display = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
        token: cast.admin.user.accessToken,
      });
      expect(display.show_score_mode).toBe("competitive");
      expect(display.public_access_enabled).toBe(true);
      expect(display.route_stages_enabled).toBe(true);
      expect(display.checkpoint_order_matters).toBe(true);

      // --- The two blocks of the route, before any post ---------------------
      // The checkpoint form only offers an "Etapa" select once stages exist,
      // and says so in its place when none do — assert that, because it is the
      // instruction an organizer actually follows.
      await adminPage.goto("/rally/admin?tab=checkpoints");
      await expect(adminPage.getByText(/Ainda não criaste nenhuma etapa/)).toBeVisible({
        timeout: 15_000,
      });

      for (const stage of AVEIRO_STAGES) {
        await adminPage.getByPlaceholder("Ex: Universidade").fill(`${stage.name} ${runId}`);
        await adminPage.getByRole("button", { name: "Adicionar etapa" }).click();
        await expect(adminPage.getByText(`${stage.name} ${runId}`).first()).toBeVisible({
          timeout: 15_000,
        });
      }

      const stages = await apiCall<{ id: number; name: string; order: number }[]>(
        "GET",
        "/route-stages",
        { token: cast.admin.user.accessToken },
      );
      const stageIds = AVEIRO_STAGES.map((stage) => {
        const row = stages.find((s) => s.name === `${stage.name} ${runId}`);
        expect(row, `stage ${stage.name} was not created`).toBeDefined();
        return row!.id;
      });

      // Each block's rule. "Fora da Uni" is the one that matters: the teams
      // spread out there, and three of its four posts were enough.
      for (const [index, stage] of AVEIRO_STAGES.entries()) {
        await apiCall("PUT", `/route-stages/${stageIds[index]}`, {
          token: cast.admin.user.accessToken,
          body: {
            name: `${stage.name} ${runId}`,
            order: index + 1,
            order_matters: stage.orderMatters,
            required_count: stage.requiredCount,
          },
        });
      }

      // --- The posts, three columns each -----------------------------------
      await adminPage.goto("/rally/admin?tab=checkpoints");
      const built: BuiltPost[] = [];
      for (const [index, post] of AVEIRO_POSTS.entries()) {
        const fullName = post.undecided ? `CF DECIDE ${runId}` : `${post.name} ${runId}`;
        const stageIndex = UNIVERSIDADE_POSTS.includes(post) ? 0 : 1;

        await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(fullName);
        await adminPage.getByPlaceholder("Ex: 40.6405").fill(String(post.latitude));
        await adminPage.getByPlaceholder("Ex: -8.6538").fill(String(post.longitude));
        await adminPage.getByPlaceholder("Ex: 50").fill(String(ARRIVAL_RADIUS_M));
        await adminPage
          .getByPlaceholder("Ex: Onde o rio encontra a ponte de ferro...")
          .fill(post.clue);
        // The two columns of the planning sheet nothing in this suite had
        // ever filled: what the person at the post talks about, and the
        // challenge as it was planned. Neither is ever shown to a team.
        await adminPage
          .getByPlaceholder("Ex: Falar dos diferentes desportos em que se podem inscrever...")
          .fill(post.staffScript);
        await adminPage
          .getByPlaceholder("Ex: Pirâmide humana. Depois, dois shots por equipa...")
          .fill(post.challengeBrief);
        // exact: the stage manager above has its own "Nome da nova etapa" box
        // and per-stage controls whose labels also contain "Etapa". The option
        // label is "{order}. {name}" (CheckpointForm), so pick it by that
        // rather than by position — a reordered select would silently file the
        // post under the wrong block.
        await adminPage
          .getByLabel("Etapa", { exact: true })
          .selectOption({ label: `${stageIndex + 1}. ${AVEIRO_STAGES[stageIndex]!.name} ${runId}` });

        if (post.undecided) {
          // Still being argued over when the sheet was written. A provisional
          // name is a planning signal; a draft is what actually keeps it out
          // of the teams' route.
          //
          // Scoped by `data-admin-search-key`, not by id: controls rendered
          // through shadcn's <FormField> get a *generated* id (":ra:-form-item"
          // and friends), so there is no #is_draft to select — the
          // search key is the only stable hook these rows carry.
          await toggleFormSwitch(adminPage, "checkpoint_provisional");
          await toggleFormSwitch(adminPage, "checkpoint_draft");
        }

        await adminPage.getByRole("button", { name: "Criar Checkpoint" }).click();
        await expect(adminPage.getByText(fullName)).toBeVisible({ timeout: 15_000 });
        built.push({ ...post, id: 0, fullName, order: index + 1, activityId: 0 });
      }

      // --- Read the whole plan back --------------------------------------
      // Through GET /checkpoint/admin/route, not GET /checkpoint/: the
      // planning view is the only one that returns drafts, the staff-only
      // columns, and what each post still lacks. It is also, conveniently,
      // exactly the readiness check an organizer does the night before.
      const route = await apiCall<{
        published_count: number;
        draft_count: number;
        incomplete_published_ids: number[];
        checkpoints: {
          id: number;
          name: string;
          order: number;
          clue: string | null;
          staff_script: string | null;
          challenge_brief: string | null;
          stage_id: number | null;
          is_draft: boolean;
          is_placeholder: boolean;
        }[];
      }>("GET", "/checkpoint/admin/route", { token: cast.admin.user.accessToken });

      const withIds: BuiltPost[] = built.map((post) => {
        const row = route.checkpoints.find((c) => c.name === post.fullName);
        expect(row, `${post.fullName} was not created by the form`).toBeDefined();
        if (!row) throw new Error("unreachable");
        // All three columns of the planning sheet survived the round trip.
        expect(row.clue).toBe(post.clue);
        expect(row.staff_script).toBe(post.staffScript);
        expect(row.challenge_brief).toBe(post.challengeBrief);
        expect(row.stage_id).toBe(
          UNIVERSIDADE_POSTS.some((p) => p.key === post.key) ? stageIds[0] : stageIds[1],
        );
        expect(row.is_draft).toBe(post.undecided === true);
        expect(row.is_placeholder).toBe(post.undecided === true);
        return { ...post, id: row.id, order: row.order, activityId: 0 };
      });

      // Five posts ready to run and one still being argued over.
      expect(route.published_count).toBe(AVEIRO_POSTS.length - 1);
      expect(route.draft_count).toBe(1);
      // Every published post is still incomplete at this point, and correctly
      // so: none of them has a challenge wired up or anyone stationed there.
      // The readiness view exists to say exactly that, and the rest of setup
      // is the work of clearing it.
      expect(new Set(route.incomplete_published_ids)).toEqual(
        new Set(withIds.filter((p) => !p.undecided).map((p) => p.id)),
      );

      // --- The undecided venue is genuinely invisible ---------------------
      // Not just flagged: a draft must not reach a team or a guide at all,
      // and its provisional name must not leak as a clue to what is coming.
      const faina = withIds.find((post) => post.undecided)!;
      const participantRoute = await apiCall<{ id: number; name: string }[]>("GET", "/checkpoint/", {
        token: cast.admin.user.accessToken,
      });
      expect(participantRoute.map((c) => c.id)).not.toContain(faina.id);
      expect(JSON.stringify(participantRoute)).not.toContain("CF DECIDE");
      // And the two staff-facing columns are in no participant payload at all —
      // handing a team the challenge brief before it arrives gives away both
      // the challenge and, often, the place.
      expect(JSON.stringify(participantRoute)).not.toContain(faina.challengeBrief);
      for (const post of withIds) {
        expect(JSON.stringify(participantRoute)).not.toContain(post.staffScript);
      }

      const guideRoute = await apiCall<{ id: number; staff_script: string | null }[]>(
        "GET",
        "/guide/checkpoints",
        { token: cast.guides[0]!.user.accessToken },
      );
      expect(guideRoute.map((c) => c.id)).not.toContain(faina.id);
      // The guide, unlike the team, is handed the script — they are the one
      // who has to talk about the cantinas between challenges.
      const aristides = withIds.find((p) => p.key === "aristides")!;
      expect(guideRoute.find((c) => c.id === aristides.id)?.staff_script).toBe(
        aristides.staffScript,
      );

      // --- CF decide ------------------------------------------------------
      // The venue is settled, so the post gets its real name and goes live.
      // This has to happen now: the backend refuses to change a draft flag
      // once teams have started, which is the whole reason it is a setup step
      // and not something an organizer can fix at 21h.
      await adminPage.goto("/rally/admin?tab=checkpoints");
      const fainaRow = adminPage.getByRole("listitem", {
        name: `Checkpoint ${faina.fullName}, ordem ${faina.order}`,
      });
      // By position, not by name: of the three action buttons on a checkpoint
      // row (media, edit, delete) only the media one carries an aria-label —
      // the edit and delete buttons are icon-only with no accessible name at
      // all, so there is nothing to select them by. That is a real
      // accessibility gap in the admin list, noted in this directory's README;
      // this locator is the workaround, not an endorsement. dispatchEvent
      // because the row is draggable and swallows a synthesized click.
      await fainaRow.locator("button").nth(1).dispatchEvent("click");
      await expect(adminPage.getByText("Editar Checkpoint")).toBeVisible({ timeout: 15_000 });

      const decidedName = `${faina.name} ${runId}`;
      await adminPage.getByPlaceholder("Ex: Checkpoint Central").fill(decidedName);
      await toggleFormSwitch(adminPage, "checkpoint_provisional");
      await toggleFormSwitch(adminPage, "checkpoint_draft");
      await adminPage.getByRole("button", { name: "Atualizar Checkpoint" }).click();
      await expect(adminPage.getByText(decidedName)).toBeVisible({ timeout: 15_000 });

      const settledRoute = await apiCall<{
        published_count: number;
        draft_count: number;
        checkpoints: { id: number; name: string; order: number; is_draft: boolean }[];
      }>("GET", "/checkpoint/admin/route", { token: cast.admin.user.accessToken });
      expect(settledRoute.draft_count).toBe(0);
      expect(settledRoute.published_count).toBe(AVEIRO_POSTS.length);
      const settledFaina = settledRoute.checkpoints.find((c) => c.id === faina.id);
      expect(settledFaina?.name).toBe(decidedName);
      expect(settledFaina?.is_draft).toBe(false);

      // Published, it takes its place in the route — inside "Fora da Uni",
      // because stages are contiguous blocks of order and the resequencing
      // keeps posts grouped by stage.
      const finalOrders = new Map(
        settledRoute.checkpoints.map((c) => [c.id, c.order] as const),
      );
      const postsWithFinalOrder: BuiltPost[] = withIds.map((post) => ({
        ...post,
        fullName: post.id === faina.id ? decidedName : post.fullName,
        order: finalOrders.get(post.id)!,
      }));
      const universidadeOrders = UNIVERSIDADE_POSTS.map(
        (p) => postsWithFinalOrder.find((b) => b.key === p.key)!.order,
      );
      const foraOrders = FORA_DA_UNI_POSTS.map(
        (p) => postsWithFinalOrder.find((b) => b.key === p.key)!.order,
      );
      expect(Math.max(...universidadeOrders)).toBeLessThan(Math.min(...foraOrders));

      // --- The challenges ---------------------------------------------
      // Four different activity types, because the real plan has four
      // different shapes of challenge: a ball at a goal is pass/fail, the
      // questions in pairs are scored, the pyramid and the line of shots is
      // against the clock, and "mais criativo" cannot be judged at the post
      // at all. Each type renders its own config inputs, so filling them is
      // the only way to catch a form that wires a box to the wrong key.
      await adminPage.goto("/rally/admin?tab=activities");
      for (const post of postsWithFinalOrder) {
        const activity = post.activity;
        await adminPage.getByRole("button", { name: "Nova Atividade" }).click();
        await adminPage.getByPlaceholder("Ex: Cabo de Guerra").fill(`${activity.name} ${runId}`);
        await adminPage.locator("select").first().selectOption({ value: String(post.id) });
        await adminPage.locator("select").nth(1).selectOption({ label: activity.typeLabel });

        for (const [fieldId, value] of Object.entries(activity.configFields)) {
          await adminPage.locator(`#${fieldId}`).fill(String(value));
        }

        for (const [index, counter] of (activity.penaltyCounters ?? []).entries()) {
          await adminPage.getByRole("button", { name: "Adicionar contador" }).click();
          await adminPage.locator(`#penalty-counter-label-${index}`).fill(counter.label);
          await adminPage.locator(`#penalty-counter-points-${index}`).fill(String(counter.points));
        }

        await adminPage.getByRole("button", { name: /^Criar$/ }).click();
        await expect(adminPage.getByText(`${activity.name} ${runId}`)).toBeVisible({
          timeout: 15_000,
        });
      }

      const activities = await apiCall<{
        activities: {
          id: number;
          name: string;
          activity_type: string;
          checkpoint_id: number;
          config: Record<string, unknown>;
        }[];
      }>("GET", "/activities/", { token: cast.admin.user.accessToken });

      const postsWithActivities: BuiltPost[] = postsWithFinalOrder.map((post) => {
        const row = activities.activities.find((a) => a.name === `${post.activity.name} ${runId}`);
        expect(row, `activity for ${post.fullName} was not created`).toBeDefined();
        if (!row) throw new Error("unreachable");
        expect(row.activity_type).toBe(post.activity.apiType);
        expect(row.checkpoint_id).toBe(post.id);
        // Every box the type-specific section rendered reached the config it
        // names — not just the ones that happen to share a default.
        for (const [fieldId, value] of Object.entries(post.activity.configFields)) {
          const configKey = CONFIG_KEY_BY_FIELD_ID[fieldId];
          expect(configKey, `no config key mapped for ${fieldId}`).toBeDefined();
          expect(row.config[configKey!], `${fieldId} did not reach config.${configKey}`).toBe(value);
        }
        const counters = (row.config.penalty_counters ?? []) as { label: string; points: number }[];
        expect(counters.map((c) => c.label)).toEqual(
          (post.activity.penaltyCounters ?? []).map((c) => c.label),
        );
        expect(counters.map((c) => c.points)).toEqual(
          (post.activity.penaltyCounters ?? []).map((c) => c.points),
        );
        return { ...post, activityId: row.id };
      });

      // --- Somebody at every post ----------------------------------------
      // A peddy paper post is not a sign on a wall: the planning sheet's first
      // column is what the person stationed there talks about, so every post
      // gets one.
      //
      // Assigned through the API rather than /rally/assignment, deliberately.
      // That page is already driven end-to-end by
      // master-peddy-tascas-day.spec.ts, so clicking through it again buys no
      // coverage — and it does not survive this suite's shared Postgres, which
      // has accumulated ~100 rally-staff users across runs and renders the
      // matching row more than once, making every locator into it ambiguous.
      // What is unique to this spec is the planning sheet above, not this.
      for (const [index, post] of postsWithActivities.entries()) {
        const member = cast.staff[index]!;
        const assignments = await apiCall<{ user_id: number; user_email?: string }[]>(
          "GET",
          "/user/staff-assignments",
          { token: cast.admin.user.accessToken },
        );
        const row = assignments.find((a) => a.user_email === member.email);
        expect(row, `${member.email} is not listed as assignable staff`).toBeDefined();
        await apiCall("PUT", `/user/${row!.user_id}/checkpoint-assignment`, {
          token: cast.admin.user.accessToken,
          body: { checkpoint_id: post.id },
        });
      }

      // --- The night-before check comes back clean ------------------------
      const ready = await apiCall<{
        published_count: number;
        draft_count: number;
        incomplete_published_ids: number[];
      }>("GET", "/checkpoint/admin/route", { token: cast.admin.user.accessToken });
      expect(ready.draft_count).toBe(0);
      expect(ready.published_count).toBe(AVEIRO_POSTS.length);
      expect(ready.incomplete_published_ids).toEqual([]);

      world = {
        cast,
        eventId: event.id,
        stageIds,
        posts: postsWithActivities,
        teams: [],
      };
    } finally {
      await adminPage.context().close();
    }
  });

  // ---------------------------------------------------------------------
  // A SAÍDA — universidade, em ordem, com toda a gente em campo ao mesmo tempo
  // ---------------------------------------------------------------------
  test("A saída — 4 equipas, 2 guias, o staff dos dois postos e o público, todos ao mesmo tempo", async ({
    browser,
  }) => {
    const { cast } = world;
    const aristides = postByKey("aristides");
    const cantina = postByKey("cantina");

    // Teams are created here rather than in planning because on the day the
    // list is still moving — people drop out and sign up at the door.
    const teams: BuiltTeam[] = [];
    for (const name of TEAM_NAMES) {
      const created = await apiCall<{ id: number; access_code: string }>("POST", "/team/", {
        token: cast.admin.user.accessToken,
        body: { name: `${name} ${cast.runId}` },
      });
      teams.push({ id: created.id, name: `${name} ${cast.runId}`, accessCode: created.access_code });
    }
    world = { ...world, teams };

    const tokens = Object.fromEntries(
      await Promise.all(
        teams.map(async (team) => [team.id, await loginTeam(team.accessCode)] as const),
      ),
    ) as Record<number, string>;

    // Guides walk with the first two teams.
    for (const [index, guide] of cast.guides.entries()) {
      const assignments = await apiCall<{ user_id: number; user_email?: string }[]>(
        "GET",
        "/user/guide-assignments",
        { token: cast.admin.user.accessToken },
      );
      const row = assignments.find((a) => a.user_email === guide.email);
      expect(row, `${guide.email} is not listed as an assignable guide`).toBeDefined();
      await apiCall("PUT", `/user/${row!.user_id}/guide-team-assignment`, {
        token: cast.admin.user.accessToken,
        body: { team_id: teams[index]!.id },
      });
    }

    const publicPage = await newPage(browser);
    const guidePages = await Promise.all(
      cast.guides.map((guide) => newAuthedPage(browser, guide.user)),
    );
    const staffAristides = await newAuthedPage(browser, cast.staff[0]!.user);
    const staffCantina = await newAuthedPage(browser, cast.staff[1]!.user);
    const teamPages = await Promise.all(teams.map(() => newPage(browser)));

    try {
      // The first two teams get the seeded session; the last two type their
      // access code into the real login form. Split on purpose: the login
      // screen has to be proven to work, but every browser login spends from
      // a per-IP rate-limit budget the whole suite shares.
      for (const [index, team] of teams.entries()) {
        if (index < 2) {
          await seedTeamSession(teamPages[index]!.context(), team, tokens[team.id]!);
        }
        await standAt(teamPages[index]!.context(), aristides);
      }

      // Everything opens at once — the board in the bar, both guides, both
      // staffed posts and all four teams, two of them signing in by hand.
      // This is the part the brief is about: on a real day nobody waits their
      // turn.
      await Promise.all([
        (async () => {
          await publicPage.goto("/rally/scoreboard");
          await expect(publicPage.getByText(teams[0]!.name)).toBeVisible({ timeout: 30_000 });
        })(),
        ...guidePages.map(async (page) => {
          await page.goto("/rally/guide");
          await expect(page.getByText("Postos — Visão do Guia")).toBeVisible({ timeout: 30_000 });
        }),
        (async () => {
          await staffAristides.goto(`/rally/staff-evaluation/checkpoint/${aristides.id}`);
        })(),
        (async () => {
          await staffCantina.goto(`/rally/staff-evaluation/checkpoint/${cantina.id}`);
        })(),
        ...teamPages.map(async (page, index) => {
          if (index < 2) {
            await page.goto("/rally/team-progress");
          } else {
            await teamLoginThroughForm(page, teams[index]!.accessCode);
          }
          await expect(page.getByText("Enigma")).toBeVisible({ timeout: 30_000 });
        }),
      ]);

      // --- What the guide is holding, on screen -----------------------------
      // The planning sheet's other two columns, rendered for the person
      // standing at the post: "Assuntos a abordar" and "Desafio". Asserted
      // here rather than only in the payload, because the whole reason those
      // fields exist is that somebody reads them off a phone at the post.
      const guideCard = guidePages[0]!.locator("section, div").filter({
        hasText: aristides.staffScript.slice(0, 40),
      });
      await expect(guidePages[0]!.getByText("Assuntos a abordar")).toBeVisible({ timeout: 30_000 });
      await expect(guideCard.first()).toBeVisible();
      await expect(guidePages[0]!.getByText("Desafio", { exact: true })).toBeVisible();
      await expect(
        guidePages[0]!.getByText(aristides.challengeBrief.slice(0, 40), { exact: false }).first(),
      ).toBeVisible();
      // And the riddle the team was given, so the guide knows what they are
      // stuck on.
      await expect(guidePages[0]!.getByText("Enigma dado à equipa")).toBeVisible();

      // The first clue is the one the sheet says it is, and the post's real
      // name is nowhere near a participant.
      for (const team of teams) {
        const route = await apiCall<{ order: number; name: string; clue: string | null }[]>(
          "GET",
          "/checkpoint/",
          { token: tokens[team.id]! },
        );
        const first = route.find((cp) => cp.order === aristides.order)!;
        expect(first.clue).toBe(aristides.clue);
        expect(JSON.stringify(route)).not.toContain(aristides.name);
      }

      // The guide, standing at the post, is holding the column the team never
      // sees: what to talk about, and the challenge as it was planned.
      const guideRoute = await apiCall<
        { id: number; staff_script: string | null; challenge_brief: string | null }[]
      >("GET", "/guide/checkpoints", { token: cast.guides[0]!.user.accessToken });
      const guideAristides = guideRoute.find((cp) => cp.id === aristides.id);
      expect(guideAristides?.staff_script).toBe(aristides.staffScript);
      expect(guideAristides?.challenge_brief).toBe(aristides.challengeBrief);

      // All four teams reach the first post at once — each pressing the
      // check-in button on its own phone, which is the participant's single
      // most-used control and the only proof of arrival a redacted route
      // leaves them.
      await Promise.all(teamPages.map((page) => checkInWithGpsButton(page)));

      // Proven from the guide's screen rather than from the team's own: the
      // panel at the post lists who has turned up, which is what the person
      // standing there actually reads. Note this is *arrival*, not progress —
      // a post with a challenge is not resolved until it is scored, so the
      // teams are here without having advanced, which is exactly the state
      // the staff member is about to work through.
      await guidePages[0]!.reload();
      for (const team of teams) {
        await expect(
          guidePages[0]!.getByText(team.name).first(),
          `${team.name} is not listed at the post`,
        ).toBeVisible({ timeout: 30_000 });
      }

      // --- The ball at the goal, scored with its miss counter --------------
      // "Encher o copo a cada um, cada falha tem de beber" is a count, not a
      // yes/no — so the Sim/Não form carries the "Falha na baliza" counter the
      // planning phase configured, and every miss costs its points.
      await staffAristides.reload();
      const misses = [0, 1, 2, 3];
      for (const [index, team] of teams.entries()) {
        await evaluateBoolean(staffAristides, team.name, {
          success: true,
          counterLabel: aristides.activity.penaltyCounters![0]!.label,
          count: misses[index]!,
        });
      }

      // The arithmetic the counter promises: success points minus one
      // deduction per miss, and no team's score below zero.
      const successPoints = aristides.activity.configFields["config-bool-success"]!;
      const perMiss = aristides.activity.penaltyCounters![0]!.points;
      for (const [index, team] of teams.entries()) {
        const detail = await apiCall<{ total: number }>("GET", `/team/${team.id}`, {
          token: cast.admin.user.accessToken,
        });
        expect(detail.total, `${team.name} scored the ball challenge wrong`).toBe(
          Math.max(0, successPoints - misses[index]! * perMiss),
        );
      }

      // --- On to the cantina, in order ------------------------------------
      // The one call in this spec that is deliberately not a button press,
      // because there is no button for it: the participant screen offers
      // exactly one "próximo posto", so wandering off to a post in the next
      // block is not something the UI can express. Driving it at the API is
      // the only way to ask what the backend does when a team turns up
      // somewhere it was not sent — which happens on a real day, app or no app.
      //
      // A team wanders off to a post in the next block. The arrival is
      // *recorded* — standing somewhere is a fact, and the API says so with a
      // 200 — but it must not move the team on: "Universidade" runs in order,
      // and its posts are not done. Progress is gated, arrivals are not, and
      // conflating the two is the easy mistake to make here.
      const strayArrival = await arriveByGps(tokens[teams[0]!.id]!, postByKey("museu"));
      expect(strayArrival.status).toBe(200);
      // Read from the team's own progress, which is what the participant
      // screen renders, rather than from /checkpoint/me: that endpoint keys
      // off `team.times`, which only staff/QR check-ins append to, so on a
      // GPS-arrival route it stays pinned to the first post with an activity.
      // Nothing in the app consumes it (see this directory's README), but it
      // is not the same number as this one, and this is the one that matters.
      const wanderer = await apiCall<{ current_checkpoint_number: number }>(
        "GET",
        `/team/${teams[0]!.id}`,
        { token: cast.admin.user.accessToken },
      );
      expect(wanderer.current_checkpoint_number, "wandering off advanced the team").toBe(
        cantina.order,
      );

      // On to the cantina — the teams walk there and press the button again,
      // rather than the test posting an arrival on their behalf.
      await Promise.all(
        teamPages.map(async (page) => {
          await standAt(page.context(), cantina);
          await page.reload();
          // .first(): the clue legitimately appears twice on this screen — in
          // the riddle panel and again in the route list below it.
          await expect(page.getByText(cantina.clue.slice(0, 30)).first()).toBeVisible({
            timeout: 30_000,
          });
          await checkInWithGpsButton(page);
        }),
      );
      await staffCantina.reload();
      // Questions in pairs, scored out of the max the form was configured with,
      // and a penalty for each pair that got it wrong.
      const scores = [80, 60, 40, 20];
      const penalties = [0, 1, 0, 2];
      for (const [index, team] of teams.entries()) {
        await evaluateScoreBased(staffCantina, team.name, {
          score: scores[index]!,
          counterLabel: cantina.activity.penaltyCounters![0]!.label,
          count: penalties[index]!,
        });
      }

      // The public board, open since before anyone set off, has every one of
      // those writes — through SSE, with no reload.
      await expect
        .poll(
          async () => {
            const board = await apiCall<{ team_id: number; total_score: number }[]>(
              "GET",
              "/scoreboard/live",
              { token: cast.admin.user.accessToken },
            );
            return teams.every(
              (team) => (board.find((row) => row.team_id === team.id)?.total_score ?? 0) > 0,
            );
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      await expect(
        publicPage.locator("a", { hasText: teams[0]!.name }).getByText(/pts/),
      ).not.toHaveText("0 pts", { timeout: 30_000 });
    } finally {
      await Promise.all([
        publicPage.context().close(),
        staffAristides.context().close(),
        staffCantina.context().close(),
        ...guidePages.map((page) => page.context().close()),
        ...teamPages.map((page) => page.context().close()),
      ]);
    }
  });

  // ---------------------------------------------------------------------
  // FORA DA UNI — bloco à escolha, e o que só se julga no fim
  // ---------------------------------------------------------------------
  test("Fora da uni — as equipas espalham-se pelos postos à escolha, e o mais criativo só se decide no fim", async ({
    browser,
  }) => {
    const { cast, teams } = world;
    const faina = postByKey("faina");
    const museu = postByKey("museu");
    const ponte = postByKey("ponte");
    const praca = postByKey("praca");

    const tokens = Object.fromEntries(
      await Promise.all(
        teams.map(async (team) => [team.id, await loginTeam(team.accessCode)] as const),
      ),
    ) as Record<number, string>;

    const staffFaina = await newAuthedPage(browser, cast.staff[2]!.user);
    const staffMuseu = await newAuthedPage(browser, cast.staff[3]!.user);
    const adminPage = await newAuthedPage(browser, cast.admin.user);
    const teamPages = await Promise.all(teams.map(() => newPage(browser)));
    for (const [index, team] of teams.entries()) {
      await seedTeamSession(teamPages[index]!.context(), team, tokens[team.id]!);
    }

    try {
      // --- The block the teams work through -------------------------------
      // "Fora da Uni" runs with order_matters off, so the backend will take a
      // team at any of its posts in any order. The participant screen does not
      // offer that choice, though: `NextCheckpointCard` renders exactly one
      // "próximo posto" and the route list below it has no check-in control at
      // all, so a team can only ever press the button for the post the app
      // picked. That gap is noted in this directory's README.
      //
      // So the block is walked in the app's own order. Note that is *not* the
      // order the sheet lists: the Faina was the undecided venue, and
      // publishing a draft appends it to the end of its stage, so it comes
      // last. Following the app rather than the sheet here is the point —
      // this is the route a team actually gets.
      const blockOrder = [museu, ponte, praca, faina];
      expect(
        blockOrder.map((post) => post.order),
        "the block is not in the order this phase assumes",
      ).toEqual([...blockOrder.map((post) => post.order)].sort((a, b) => a - b));

      // --- Recriar uma obra, pontuada à mão -------------------------------
      await Promise.all(
        teamPages.map((page, index) =>
          walkToPostAndCheckIn(page, teams[index]!.id, museu, cast.admin.user.accessToken),
        ),
      );
      await staffMuseu.goto(`/rally/staff-evaluation/checkpoint/${museu.id}`);
      const museuPoints = [55, 40, 30, 20];
      for (const [index, team] of teams.entries()) {
        await evaluateGeneral(staffMuseu, team.name, museuPoints[index]!);
      }

      // --- What nobody at the post can decide -----------------------------
      // "Mais criativo recebe uma salva de palmas" is not a score a staff
      // member can give on the spot: it only means anything once every team
      // has had its turn. So the post captures the attempt and the judging
      // happens afterwards — which is what a deferred-judged activity is.
      await Promise.all(
        teamPages.map((page, index) =>
          walkToPostAndCheckIn(page, teams[index]!.id, ponte, cast.admin.user.accessToken),
        ),
      );
      for (const team of teams) {
        const captured = await fetch(
          `${API_V1}/activities/deferred/${ponte.activityId}/capture?team_id=${team.id}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${cast.staff[4]!.user.accessToken}` },
            body: new FormData(),
          },
        );
        expect(captured.status, `capture for ${team.name} failed`).toBe(201);
      }

      // Nothing is scored yet — that is the whole point of deferring it.
      const pending = await apiCall<{ id: number; team_id: number; is_completed: boolean }[]>(
        "GET",
        "/activities/deferred/pending",
        { token: cast.admin.user.accessToken },
      );
      const pontePending = pending.filter((r) => teams.some((t) => t.id === r.team_id));
      expect(pontePending.length).toBeGreaterThanOrEqual(teams.length);

      // --- The judge decides, at the end, in one sitting -------------------
      const ponteResults = await apiCall<{ id: number; team_id: number }[]>(
        "GET",
        `/activities/deferred/${ponte.activityId}/results`,
        { token: cast.admin.user.accessToken },
      );
      // The speech the organizers liked best, then the rest.
      const ordered = [teams[2]!, teams[0]!, teams[3]!, teams[1]!].map(
        (team) => ponteResults.find((r) => r.team_id === team.id)!.id,
      );
      const ranked = await apiCall<{ id: number; team_id: number; final_score: number | null }[]>(
        "POST",
        `/activities/deferred/${ponte.activityId}/rank`,
        { token: cast.admin.user.accessToken, body: { ordered_result_ids: ordered } },
      );
      const scoreFor = (teamId: number) =>
        ranked.find((r) => r.team_id === teamId)?.final_score ?? 0;
      // First place takes the activity's maximum, last its minimum, and the
      // order the judge chose is the order of the scores.
      expect(scoreFor(teams[2]!.id)).toBe(ponte.activity.configFields["config-dj-max-points"]);
      expect(scoreFor(teams[1]!.id)).toBe(ponte.activity.configFields["config-dj-min-points"]);
      expect(scoreFor(teams[2]!.id)).toBeGreaterThan(scoreFor(teams[0]!.id));
      expect(scoreFor(teams[0]!.id)).toBeGreaterThan(scoreFor(teams[3]!.id));

      // --- The Titanic scene, captured the same way -------------------------
      await Promise.all(
        teamPages.map((page, index) =>
          walkToPostAndCheckIn(page, teams[index]!.id, praca, cast.admin.user.accessToken),
        ),
      );
      for (const team of teams) {
        const captured = await fetch(
          `${API_V1}/activities/deferred/${praca.activityId}/capture?team_id=${team.id}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${cast.staff[5]!.user.accessToken}` },
            body: new FormData(),
          },
        );
        expect(captured.status, `praça capture for ${team.name} failed`).toBe(201);
      }
      await apiCall("POST", `/activities/deferred/${praca.activityId}/rank`, {
        token: cast.admin.user.accessToken,
        body: {
          ordered_result_ids: (
            await apiCall<{ id: number; team_id: number }[]>(
              "GET",
              `/activities/deferred/${praca.activityId}/results`,
              { token: cast.admin.user.accessToken },
            )
          ).map((row) => row.id),
        },
      });

      // --- The pyramid and the line of shots, against the clock ------------
      // "Sem reação em menos de 3 min": scored on the seconds it took, ranked
      // against the other teams. Last in the block, because the venue for it
      // was the one still undecided when the sheet was written.
      await Promise.all(
        teamPages.map((page, index) =>
          walkToPostAndCheckIn(page, teams[index]!.id, faina, cast.admin.user.accessToken),
        ),
      );
      await staffFaina.goto(`/rally/staff-evaluation/checkpoint/${faina.id}`);
      const seconds = [95, 140, 172, 178];
      for (const [index, team] of teams.entries()) {
        await evaluateTimeBased(staffFaina, team.name, seconds[index]!);
      }
      // Fastest gets the configured maximum; slowest the minimum.
      const timeResults = await apiCall<{
        evaluations: { team_id: number; activity_id: number; final_score: number | null }[];
      }>("GET", "/staff/all-evaluations", { token: cast.admin.user.accessToken });
      const fainaScore = (teamId: number) =>
        timeResults.evaluations.find(
          (e) => e.team_id === teamId && e.activity_id === faina.activityId,
        )?.final_score ?? 0;
      expect(fainaScore(teams[0]!.id)).toBe(faina.activity.configFields["config-tb-max-points"]);
      expect(fainaScore(teams[3]!.id)).toBe(faina.activity.configFields["config-tb-min-points"]);
      expect(fainaScore(teams[0]!.id)).toBeGreaterThan(fainaScore(teams[1]!.id));

      // --- The route is finished ------------------------------------------
      // Every post of both blocks is done, so the app stops handing out a next
      // one — asserted on the participant's own screen, which is where a team
      // finds out the route is over.
      // Every post of both blocks is resolved for every team, so the server
      // has no next one left to hand out.
      for (const team of teams) {
        const progress = await apiCall<{ last_checkpoint_number: number }>(
          "GET",
          `/team/${team.id}`,
          { token: cast.admin.user.accessToken },
        );
        expect(
          progress.last_checkpoint_number,
          `${team.name} has posts left`,
        ).toBe(world.posts.length);
      }

      // ------------------------------------------------------------------
      // PINNED KNOWN ISSUE — a team that finishes is never told it finished.
      //
      // `RouteFinishedCard` ("Chegaram ao fim!") renders on
      // `isFinished = !nextCheckpoint && checkpoints.length > 0`, and
      // `useTeamProgress` derives the next post as
      // `checkpoints.find(cp => cp.order === team.current_checkpoint_number)`.
      // But `TeamService` clamps that number: `current_order = last + 1 if
      // last < max_order else last`. So once every post is resolved it stays
      // pinned to the *last* post's order, the client finds that checkpoint,
      // `nextCheckpoint` stays truthy, and the team is shown the post it has
      // already finished as its "próximo posto" — forever. The finished card
      // is unreachable.
      //
      // Only visible by driving the participant screen to the end of a route,
      // which is why it survived: the API says 6 of 6 and is right.
      //
      // Asserted rather than described so it cannot change silently. When it
      // is fixed, this block fails — replace it with the positive assertion
      // and drop the note from this directory's README.
      // ------------------------------------------------------------------
      await teamPages[0]!.goto("/rally/team-progress");
      await expect(teamPages[0]!.getByText("Chegaram ao fim!")).toHaveCount(0);
      await expect(teamPages[0]!.getByText(/Próximo|Próxima/).first()).toBeVisible({
        timeout: 30_000,
      });

      // --- Standings --------------------------------------------------------
      // The public board agrees with each team's own total.
      //
      // Compared after rounding, and only here: `update_team_scores` stores
      // `Team.total` as a rounded integer while `_get_global_ranking` keeps
      // the float, and a time-based activity ranks teams linearly between its
      // min and max, so this route produces genuinely fractional scores
      // (378.33 stored as 378). The two numbers are the same score to within
      // that rounding, which is what this asserts — an exact match would be
      // asserting that no activity type ever yields a fraction.
      await expect
        .poll(
          async () => {
            const board = await apiCall<{ team_id: number; total_score: number }[]>(
              "GET",
              "/scoreboard/live",
              { token: cast.admin.user.accessToken },
            );
            const totals = await Promise.all(
              teams.map(async (team) =>
                (
                  await apiCall<{ total: number }>("GET", `/team/${team.id}`, {
                    token: cast.admin.user.accessToken,
                  })
                ).total,
              ),
            );
            return teams.every((team, index) => {
              const boardScore = board.find((row) => row.team_id === team.id)?.total_score;
              return boardScore !== undefined && Math.round(boardScore) === totals[index];
            });
          },
          { timeout: 30_000 },
        )
        .toBe(true);

      // And the day is in the record: the audit trail carries this edition's
      // evaluations, which is what an organizer goes back to when a team
      // disputes a score a week later.
      const audit = await apiCall<{ action: string }[]>("GET", "/audit?limit=100", {
        token: cast.admin.user.accessToken,
      });
      expect(audit.length).toBeGreaterThan(0);

      // The exports an organizer actually sends round afterwards.
      for (const path of ["export", "report"]) {
        const file = await fetch(`${API_V1}/events/${world.eventId}/${path}`, {
          headers: { Authorization: `Bearer ${cast.admin.user.accessToken}` },
        });
        expect(file.status, `${path} failed`).toBe(200);
        expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(0);
      }
    } finally {
      await Promise.all([
        staffFaina.context().close(),
        staffMuseu.context().close(),
        adminPage.context().close(),
        ...teamPages.map((page) => page.context().close()),
      ]);
    }
  });
});
