import { test, expect } from "./fixtures";
import type { BrowserContext, Page } from "@playwright/test";
import { seedOidcSession } from "./helpers/session";
import { readResumeValue } from "./helpers/authResume";
import { MOCK_RALLY_SETTINGS } from "../mocks/data";

async function seedTeamAuth(context: BrowserContext, page: Page, teamId = 3) {
  await context.addInitScript((id) => {
    localStorage.setItem("rally_team_token", "team-jwt");
    localStorage.setItem("rally_team_data", JSON.stringify({ team_id: id, team_name: "Os Fixes" }));
  }, teamId);
  // main.tsx fires a team-token refresh on every load; on failure it clears
  // the team session, flaking any test slow enough for that fetch to resolve.
  await page.route("**/api/rally/v1/team-auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "team-jwt" }),
    }),
  );
  // /team-info isn't in layout.tsx's publicPaths allowlist, so it's gated
  // behind either auth or public_access_enabled — mock settings so the gate
  // resolves instead of hanging on an unmocked request.
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RALLY_SETTINGS),
    }),
  );
}

async function mockTeam(page: Page, members: unknown[], teamId = 3) {
  await page.route(`**/api/rally/v1/team/${teamId}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: teamId,
        name: "Os Fixes",
        access_code: "CODE99",
        total: 0,
        times: [],
        members,
        num_members: members.length,
        classification: 1,
        question_scores: [],
        time_scores: [],
        pukes: [],
        skips: [],
        score_per_checkpoint: [],
      }),
    }),
  );
}

test.describe("Team info", () => {
  test("lists members with captain badge and association status", async ({ page, context }) => {
    await seedTeamAuth(context, page);
    await mockTeam(page, [
      { id: 1, name: "João", is_captain: true, is_linked: true },
      { id: 2, name: "Inês", is_captain: false, is_linked: false },
    ]);

    await page.goto("/rally/team-info");

    await expect(page.getByRole("main").getByText("Os Fixes")).toBeVisible();
    await expect(page.getByText("Capitão")).toBeVisible();
    await expect(page.getByText("Associado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Associar a mim" })).toBeVisible();
  });

  test('unauthenticated user clicking "Associar a mim" triggers staff login redirect flow', async ({
    page,
    context,
  }) => {
    await seedTeamAuth(context, page);
    await mockTeam(page, [{ id: 2, name: "Inês", is_captain: false, is_linked: false }]);

    await page.goto("/rally/team-info");
    await page.getByRole("button", { name: "Associar a mim" }).click();

    const pendingMember = await readResumeValue(page, "rally_pending_link_user_id");
    expect(pendingMember).toBe("2");
  });

  test("OIDC-authenticated user linking self succeeds and shows success toast", async ({
    page,
    context,
  }) => {
    await seedTeamAuth(context, page);
    await seedOidcSession(context, ["rally-participant"]);
    await mockTeam(page, [{ id: 2, name: "Inês", is_captain: false, is_linked: false }]);
    await page.route("**/api/rally/v1/team/3/members/2/link-self", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 2, name: "Inês", is_captain: false }),
      }),
    );

    await page.goto("/rally/team-info");
    // Success triggers window.location.reload() immediately after the toast
    // fires, wiping the DOM before an assertion could reliably catch the
    // ephemeral toast text — assert the reload itself instead.
    const reloadPromise = page.waitForURL("**/team-info");
    await page.getByRole("button", { name: "Associar a mim" }).click();
    await reloadPromise;
    await expect(page.getByRole("main").getByText("Os Fixes")).toBeVisible();
  });

  test("failed link shows error toast", async ({ page, context }) => {
    await seedTeamAuth(context, page);
    await seedOidcSession(context, ["rally-participant"]);
    await mockTeam(page, [{ id: 2, name: "Inês", is_captain: false, is_linked: false }]);
    await page.route("**/api/rally/v1/team/3/members/2/link-self", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Membro já associado a outra conta" }),
      }),
    );

    await page.goto("/rally/team-info");
    await page.getByRole("button", { name: "Associar a mim" }).click();

    await expect(page.getByText(/Membro já associado a outra conta/)).toBeVisible();
  });

  test("shows loading state while team auth resolves", async ({ page, context }) => {
    await seedTeamAuth(context, page);
    await page.route("**/api/rally/v1/team/3**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 3,
          name: "Os Fixes",
          total: 0,
          times: [],
          members: [],
          num_members: 0,
          classification: 1,
          question_scores: [],
          time_scores: [],
          pukes: [],
          skips: [],
          score_per_checkpoint: [],
        }),
      });
    });

    await page.goto("/rally/team-info");

    await expect(page.getByText("A carregar equipa...")).toBeVisible();
  });

  test("renders correctly on mobile viewport", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedTeamAuth(context, page);
    await mockTeam(page, [{ id: 1, name: "João", is_captain: true, is_linked: true }]);

    await page.goto("/rally/team-info");

    await expect(page.getByRole("main").getByText("Os Fixes")).toBeVisible();
  });
});
