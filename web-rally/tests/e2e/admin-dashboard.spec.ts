import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { seedOidcSession, ADMIN_GROUPS } from "./helpers/session";
import { MOCK_RALLY_SETTINGS, MOCK_TEAM } from "../mocks/data";
import type { RallySettingsResponse } from "@/client";

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) }),
  );
}

async function mockTeams(page: Page, teams: unknown[]) {
  await page.route("**/api/rally/v1/team/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(teams) }),
  );
}

async function mockCheckpoints(page: Page, checkpoints: unknown[]) {
  await page.route("**/api/rally/v1/checkpoint/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(checkpoints),
    }),
  );
}

async function mockEvaluations(page: Page, count: number) {
  await page.route("**/api/rally/v1/staff/all-evaluations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        evaluations: Array.from({ length: count }, (_, i) => ({ id: i + 1 })),
      }),
    }),
  );
}

function team(overrides: Record<string, unknown>) {
  return { ...MOCK_TEAM, ...overrides };
}

const CHECKPOINTS = [
  { id: 1, name: "Posto 1", description: null, latitude: null, longitude: null, order: 1 },
  { id: 2, name: "Posto 2", description: null, latitude: null, longitude: null, order: 2 },
];

test.describe("Admin dashboard", () => {
  test("shows stat cards for teams, checkpoints, started teams and evaluations", async ({
    page,
    context,
  }) => {
    await mockSettings(page, {
      rally_start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      rally_end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [
      team({ id: 1, name: "Os Fintas", last_checkpoint_number: 1 }),
      team({ id: 2, name: "Engenhocas", last_checkpoint_number: 0 }),
    ]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 4);

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("Estado do evento")).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Equipas$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Avaliações$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Iniciaram$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Postos$/ })).toBeVisible();
  });

  test("shows not-started alert while rally is live and some teams have not begun", async ({
    page,
    context,
  }) => {
    await mockSettings(page, {
      rally_start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      rally_end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [team({ id: 1, name: "Os Fintas", last_checkpoint_number: 0 })]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 0);

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("ainda não iniciou o percurso")).toBeVisible();
  });

  test("does not show not-started alert before the rally begins", async ({ page, context }) => {
    await mockSettings(page, {
      rally_start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      rally_end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [team({ id: 1, name: "Os Fintas", last_checkpoint_number: 0 })]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 0);

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("ainda não iniciou o percurso")).toHaveCount(0);
  });

  test("renders per-checkpoint progress chart when checkpoints exist", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [team({ id: 1, name: "Os Fintas", last_checkpoint_number: 2 })]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 1);

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("Equipas por posto")).toBeVisible();
  });
});
