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

async function mockEventConfiguration(
  page: Page,
  report: { ready: boolean; issues: unknown[]; capabilities?: Record<string, unknown> },
) {
  await page.route("**/api/rally/v1/events/current", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, event_type: "peddy_paper", event_profile: "autonomous" }),
    }),
  );
  await page.route("**/api/rally/v1/events/*/configuration-status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        event_type: "peddy_paper",
        event_profile: "autonomous",
        ready: report.ready,
        capabilities: report.capabilities ?? {},
        issues: report.issues,
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
      team({
        id: 1,
        name: "Os Fintas",
        started_at: "2026-09-16T19:00:00Z",
        resolved_checkpoint_orders: [1],
        last_checkpoint_number: 1,
      }),
      team({ id: 2, name: "Engenhocas", started_at: null, resolved_checkpoint_orders: [] }),
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
    await mockTeams(page, [team({ id: 1, name: "Os Fintas", started_at: null })]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 0);

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("ainda não iniciou o percurso")).toBeVisible();
  });

  test("shows the preparation dashboard, not live stats, before the rally begins", async ({
    page,
    context,
  }) => {
    // Regression guard: before this refactor the dashboard always rendered
    // OperationsDashboard (né LiveDashboard) regardless of phase, so the
    // "not started" alert was the only thing phase-gated. Now the whole
    // tree switches — verify PreparationDashboard is what actually renders,
    // not just that one unrelated alert is absent from something else.
    await mockSettings(page, {
      rally_start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      rally_end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [team({ id: 1, name: "Os Fintas", started_at: null })]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 0);
    await mockEventConfiguration(page, { ready: true, issues: [] });

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("Preparação da prova")).toBeVisible();
    await expect(page.getByText("ainda não iniciou o percurso")).toHaveCount(0);
    // Live-only stats/chart must not leak into the pre-event view.
    await expect(page.getByText("Estado do evento")).toHaveCount(0);
    await expect(page.getByText("Equipas que concluíram por posto")).toHaveCount(0);
  });

  test("renders per-checkpoint progress chart when checkpoints exist", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [
      team({
        id: 1,
        name: "Os Fintas",
        started_at: "2026-09-16T19:00:00Z",
        resolved_checkpoint_orders: [1, 2],
        last_checkpoint_number: 2,
      }),
    ]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 1);

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("Equipas que concluíram por posto")).toBeVisible();
  });
});

test.describe("Admin dashboard — preparation readiness", () => {
  const PRE_EVENT_SETTINGS = {
    rally_start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    rally_end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };

  test("shows a ready summary with no issues to fix", async ({ page, context }) => {
    await mockSettings(page, PRE_EVENT_SETTINGS);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [team({ id: 1, name: "Os Fintas" })]);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 0);
    await mockEventConfiguration(page, { ready: true, issues: [] });

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("Configuração pronta")).toBeVisible();
    await expect(page.getByText("Corrigir →")).toHaveCount(0);
  });

  test("an actionable issue's Corrigir link navigates to its mapped tab", async ({
    page,
    context,
  }) => {
    await mockSettings(page, PRE_EVENT_SETTINGS);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, [team({ id: 1, name: "Os Fintas" })]);
    await mockCheckpoints(page, []);
    await mockEvaluations(page, 0);
    await mockEventConfiguration(page, {
      ready: false,
      issues: [
        {
          code: "NO_CHECKPOINTS",
          severity: "error",
          message: "Este perfil necessita de pelo menos um posto publicado.",
          entity_type: "checkpoint",
          suggestion: "Crie e publique pelo menos um posto no percurso.",
        },
      ],
    });

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("Configuração incompleta")).toBeVisible();
    await expect(
      page.getByText("Este perfil necessita de pelo menos um posto publicado."),
    ).toBeVisible();

    await page.getByText("Corrigir →").click();

    // NO_CHECKPOINTS maps to the "checkpoints" tab (readinessNavigation.ts).
    await expect(page).toHaveURL(/tab=checkpoints/);
  });

  test("warnings alone keep the event ready", async ({ page, context }) => {
    await mockSettings(page, PRE_EVENT_SETTINGS);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockTeams(page, []);
    await mockCheckpoints(page, CHECKPOINTS);
    await mockEvaluations(page, 0);
    await mockEventConfiguration(page, {
      ready: true,
      issues: [
        {
          code: "NO_TEAMS",
          severity: "warning",
          message: "Ainda não existem equipas registadas.",
          entity_type: "team",
        },
      ],
    });

    await page.goto("/rally/admin?tab=dashboard");

    await expect(page.getByText("Pronto para começar")).toBeVisible();
    await expect(page.getByText("Ainda não existem equipas registadas.")).toBeVisible();
  });
});
