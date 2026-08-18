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

function team(overrides: Record<string, unknown>) {
  return { ...MOCK_TEAM, ...overrides };
}

const TEAMS = [
  team({ id: 1, name: "Os Fintas" }),
  team({ id: 2, name: "Engenhocas" }),
  team({ id: 3, name: "Última Ronda" }),
  team({ id: 4, name: "Cabo de Guerra" }),
];

const CHECKPOINTS = [
  { id: 1, name: "Posto Alpha", description: null, latitude: null, longitude: null, order: 1 },
  { id: 2, name: "Posto Beta", description: null, latitude: null, longitude: null, order: 2 },
];

// 4 teams, 3 rounds, round-robin: each team faces every other exactly once
// across the tournament, no team repeats a checkpoint pairing partner twice.
const ROUNDS = [
  [
    { team_id: 1, checkpoint_id: 1 },
    { team_id: 2, checkpoint_id: 2 },
  ],
  [
    { team_id: 3, checkpoint_id: 1 },
    { team_id: 4, checkpoint_id: 2 },
  ],
  [
    { team_id: 1, checkpoint_id: 2 },
    { team_id: 3, checkpoint_id: 2 },
  ],
];

test.describe("Olympic-event rotation schedule", () => {
  // Interaction/data test (button placement + admin sidebar layout), not a
  // visual one — the mobile project's narrower viewport just adds a
  // hamburger-menu overlay that intercepts these clicks, no extra signal.
  // eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring here
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Desktop-only: not a visual/layout test"); // NOSONAR(S1607): reason given in the skip() call above
  });

  test("generates a round-robin schedule for a 4-team olympic event with resolved team/checkpoint names", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route("**/api/rally/v1/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 10,
            name: "Jogos Olímpicos",
            event_type: "olympic",
            description: null,
            start_time: null,
            end_time: null,
            is_current: true,
          },
        ]),
      }),
    );
    await page.route("**/api/rally/v1/team/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEAMS) }),
    );
    await page.route("**/api/rally/v1/checkpoint/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(CHECKPOINTS),
      }),
    );
    await page.route("**/api/rally/v1/events/10/rotation-schedule", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rounds: ROUNDS }),
      }),
    );

    await page.goto("/rally/admin?tab=events");
    await page.getByRole("button", { name: "Gerar escalonamento" }).click();

    await expect(page.getByText("3 rondas")).toBeVisible();

    // Round-name resolution: no leftover "Equipa #N" / "Checkpoint #N" fallback
    // text should appear once the teams/checkpoints queries have resolved —
    // the view must be showing real names, not raw ids.
    const round1 = page.getByRole("region", { name: "Ronda 1" });
    await expect(round1.getByText("Os Fintas")).toBeVisible();
    await expect(round1.getByText("Posto Alpha")).toBeVisible();
    await expect(round1.getByText("Engenhocas")).toBeVisible();
    await expect(round1.getByText("Posto Beta")).toBeVisible();

    const round2 = page.getByRole("region", { name: "Ronda 2" });
    await expect(round2.getByText("Última Ronda")).toBeVisible();
    await expect(round2.getByText("Cabo de Guerra")).toBeVisible();

    const round3 = page.getByRole("region", { name: "Ronda 3" });
    await expect(round3.getByText("Os Fintas")).toBeVisible();
    await expect(round3.getByText("Última Ronda")).toBeVisible();

    await expect(page.getByText(/Equipa #\d/)).toHaveCount(0);
    await expect(page.getByText(/Checkpoint #\d/)).toHaveCount(0);
  });

  test("regenerating an existing schedule relabels the button and refetches", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route("**/api/rally/v1/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 10,
            name: "Jogos Olímpicos",
            event_type: "olympic",
            description: null,
            start_time: null,
            end_time: null,
            is_current: true,
          },
        ]),
      }),
    );
    await page.route("**/api/rally/v1/team/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEAMS) }),
    );
    await page.route("**/api/rally/v1/checkpoint/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(CHECKPOINTS),
      }),
    );
    let generateCallCount = 0;
    await page.route("**/api/rally/v1/events/10/rotation-schedule", (route) => {
      generateCallCount += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rounds: ROUNDS }),
      });
    });

    await page.goto("/rally/admin?tab=events");
    await page.getByRole("button", { name: "Gerar escalonamento" }).click();
    await expect(page.getByText("3 rondas")).toBeVisible();

    await page.getByRole("button", { name: "Regenerar escalonamento" }).click();

    await expect.poll(() => generateCallCount).toBe(2);
  });

  test("a generic (non-olympic) event never shows a rotation schedule button", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route("**/api/rally/v1/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 11,
            name: "Rally Genérico",
            event_type: "generic",
            description: null,
            start_time: null,
            end_time: null,
            is_current: true,
          },
        ]),
      }),
    );
    await page.route("**/api/rally/v1/team/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.route("**/api/rally/v1/checkpoint/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );

    await page.goto("/rally/admin?tab=events");

    await expect(page.getByRole("button", { name: "Gerar escalonamento" })).toHaveCount(0);
  });
});
