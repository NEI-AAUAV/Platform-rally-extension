import { test, expect } from "./fixtures";
import type { BrowserContext, Page } from "@playwright/test";
import { MOCK_RALLY_SETTINGS } from "../mocks/data";

async function seedTeamAuth(context: BrowserContext, teamId = 3, teamName = "Os Fixes") {
  await context.addInitScript(
    ([id, name]) => {
      localStorage.setItem("rally_team_token", "team-jwt");
      localStorage.setItem("rally_team_data", JSON.stringify({ team_id: id, team_name: name }));
    },
    [teamId, teamName] as [number, string],
  );
}

async function mockSettings(page: Page) {
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RALLY_SETTINGS),
    }),
  );
  // main.tsx fires a team-token refresh on every load; on failure it clears
  // the team session, which flakes any test slow enough for that fetch to
  // resolve. Keep it a no-op success so seeded auth survives the test.
  await page.route("**/api/rally/v1/team-auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "team-jwt" }),
    }),
  );
}

test.describe("Team settings", () => {
  test("shows current team name", async ({ page, context }) => {
    await mockSettings(page);
    await seedTeamAuth(context);

    await page.goto("/rally/team-settings");

    await expect(page.getByText("Equipa atual: Os Fixes")).toBeVisible();
  });

  test('"Trocar Equipa" navigates to team-login', async ({ page, context }) => {
    await mockSettings(page);
    await seedTeamAuth(context);

    await page.goto("/rally/team-settings");
    await page.getByRole("button", { name: "Trocar Equipa" }).click();

    await page.waitForURL("**/team-login");
    await expect(page).not.toHaveURL(/\/team-settings/);
  });

  test("logout requires confirmation and clears session", async ({ page, context }) => {
    await mockSettings(page);
    await seedTeamAuth(context);

    await page.goto("/rally/team-settings");
    await page.getByRole("button", { name: "Terminar Sessão" }).click();

    await expect(page.getByText("Terminar sessão?")).toBeVisible();
    await page.getByRole("button", { name: "Terminar Sessão" }).last().click();

    await page.waitForURL("**/rally/");
    const token = await page.evaluate(() => localStorage.getItem("rally_team_token"));
    expect(token).toBeNull();
  });

  test("canceling the logout dialog keeps the session", async ({ page, context }) => {
    await mockSettings(page);
    await seedTeamAuth(context);

    await page.goto("/rally/team-settings");
    await page.getByRole("button", { name: "Terminar Sessão" }).click();
    await expect(page.getByText("Terminar sessão?")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    await expect(page.getByText("Terminar sessão?")).toHaveCount(0);
    const token = await page.evaluate(() => localStorage.getItem("rally_team_token"));
    expect(token).toBe("team-jwt");
  });

  test("renders correctly on mobile viewport", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page);
    await seedTeamAuth(context);

    await page.goto("/rally/team-settings");

    await expect(page.getByRole("heading", { name: "Definições" })).toBeVisible();
  });
});
