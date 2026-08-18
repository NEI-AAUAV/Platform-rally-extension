import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { seedOidcSession, ADMIN_GROUPS } from "./helpers/session";
import { MOCK_RALLY_SETTINGS, MOCK_TEAM } from "../mocks/data";

async function mockSettings(page: Page) {
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RALLY_SETTINGS),
    }),
  );
}

function badge(overrides: Record<string, unknown>) {
  return {
    id: 1,
    code: "first-checkin",
    name: "Primeiro Check-in",
    description: "Fez o primeiro check-in",
    color: "#008542",
    glyph: "🏁",
    icon_url: null,
    is_auto: false,
    is_active: true,
    trigger_type: null,
    ...overrides,
  };
}

async function mockBadges(page: Page, badges: unknown[]) {
  await page.route("**/api/rally/v1/badge-definitions", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(badges),
      });
    }
    return route.fallback();
  });
}

async function mockTeams(page: Page, teams: unknown[]) {
  await page.route("**/api/rally/v1/team/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(teams) }),
  );
}

async function gotoBadges(page: Page) {
  await page.goto("/rally/admin?tab=badges");
}

test.describe("Admin badges", () => {
  test("shows empty catalogue state", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockBadges(page, []);
    await mockTeams(page, []);

    await gotoBadges(page);

    await expect(page.getByText("Sem crachás no catálogo")).toBeVisible();
  });

  test("creates a manual badge definition", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockBadges(page, []);
    await mockTeams(page, []);
    let capturedBody: unknown;
    await page.route("**/api/rally/v1/badge-definitions", (route) => {
      if (route.request().method() === "POST") {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(badge(capturedBody as Record<string, unknown>)),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await gotoBadges(page);
    await page.getByRole("button", { name: "Novo crachá" }).click();
    await page.getByPlaceholder("ex: first_arrival").fill("melhor_claque");
    await page.getByPlaceholder("Nome do crachá").fill("Melhor Claque");
    await page.getByRole("button", { name: /Criar$/ }).click();

    await expect.poll(() => (capturedBody as { code?: string })?.code).toBe("melhor_claque");
    await expect.poll(() => (capturedBody as { is_auto?: boolean })?.is_auto).toBe(false);
  });

  test("editing a badge pre-fills the form with a disabled code field", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockBadges(page, [badge({})]);
    await mockTeams(page, []);

    await gotoBadges(page);
    await page.getByTitle("Editar").click();

    await expect(page.getByText("Editar crachá")).toBeVisible();
    const codeInput = page.getByPlaceholder("ex: first_arrival");
    await expect(codeInput).toHaveValue("first-checkin");
    await expect(codeInput).toBeDisabled();
  });

  test("deleting a badge with assigned badges requires confirmation", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockBadges(page, [badge({})]);
    await mockTeams(page, []);
    let deleteCalled = false;
    await page.route("**/api/rally/v1/badge-definitions/1", (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    });

    await gotoBadges(page);
    await page.getByTitle("Eliminar").click();
    await expect(page.getByText("Eliminar crachá?")).toBeVisible();
    await page.getByRole("button", { name: "Eliminar" }).last().click();

    await expect.poll(() => deleteCalled).toBe(true);
  });

  test("toggling active state calls update with the flipped flag", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockBadges(page, [badge({ is_active: true })]);
    await mockTeams(page, []);
    let capturedBody: unknown;
    await page.route("**/api/rally/v1/badge-definitions/1", (route) => {
      if (route.request().method() === "PUT") {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(badge({ is_active: false })),
        });
      }
      return route.fallback();
    });

    await gotoBadges(page);
    await page.getByTitle("Desativar").click();

    await expect.poll(() => capturedBody).toEqual({ is_active: false });
  });

  test("manually awards a badge to a team", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockBadges(page, [badge({})]);
    await mockTeams(page, [{ ...MOCK_TEAM, id: 7, name: "Última Ronda" }]);
    await page.route("**/api/rally/v1/teams/7/badges", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    let capturedBody: unknown;
    await page.route("**/api/rally/v1/badges/award", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 99 }),
      });
    });

    await gotoBadges(page);
    await page.getByText("Atribuição manual").scrollIntoViewIfNeeded();
    await page.getByText("Escolher equipa…").click();
    await page.getByRole("option", { name: "Última Ronda" }).click();
    await page.getByText("Escolher crachá…").click();
    await page.getByRole("option", { name: "Primeiro Check-in" }).click();
    await page.getByRole("button", { name: "Atribuir crachá" }).click();

    await expect.poll(() => capturedBody).toEqual({ team_id: 7, badge_code: "first-checkin" });
  });
});
