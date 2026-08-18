import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { MOCK_RALLY_SETTINGS, MOCK_TEAM } from "../mocks/data";
import type { RallySettingsResponse } from "@/client";

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) }),
  );
  return settings;
}

async function mockTeams(page: Page, teams = [MOCK_TEAM]) {
  await page.route("**/api/rally/v1/team/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(teams) }),
  );
}

async function mockCheckpoints(page: Page, checkpoints: unknown[] = []) {
  await page.route("**/api/rally/v1/checkpoint/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(checkpoints),
    }),
  );
}

/** Scroll-triggered (framer-motion whileInView) sections only mount once
 * scrolled into the viewport; step down the page so each has a chance to
 * cross the 20% visibility threshold. */
async function scrollThroughPage(page: Page) {
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 600);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  }
}

test.describe("Home", () => {
  test("renders hero, marquee and CTAs for anonymous visitor", async ({ page }) => {
    await mockSettings(page);
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.locator("#home-hero-heading")).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrar com a Equipa" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver Pontuação" })).toBeVisible();
  });

  test("shows live pill during rally window", async ({ page }) => {
    await mockSettings(page, {
      rally_start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      rally_end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.getByText("A decorrer agora")).toBeVisible();
  });

  test('shows "Em breve" pill before rally starts', async ({ page }) => {
    await mockSettings(page, {
      rally_start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      rally_end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.getByText("Em breve")).toBeVisible();
  });

  test('shows "Edição terminada" pill after rally ends', async ({ page }) => {
    await mockSettings(page, {
      rally_start_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      rally_end_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.getByText("Edição terminada")).toBeVisible();
  });

  test("hides LiveTop5 section when show_score_mode is hidden", async ({ page }) => {
    await mockSettings(page, { show_score_mode: "hidden" });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.locator("#top5-heading")).toHaveCount(0);
  });

  test("shows LiveTop5 heading when score mode is not hidden and teams exist", async ({ page }) => {
    await mockSettings(page, { show_score_mode: "all" });
    await mockTeams(page, [
      MOCK_TEAM,
      { ...MOCK_TEAM, id: 2, name: "Second Team", classification: 2 },
    ]);
    await mockCheckpoints(page);

    await page.goto("/rally/");
    await scrollThroughPage(page);

    await expect(page.locator("#top5-heading")).toBeVisible();
  });

  test("hides postos preview when show_checkpoint_map is false", async ({ page }) => {
    await mockSettings(page, { show_checkpoint_map: false });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.locator("#postos-heading")).toHaveCount(0);
  });

  test("shows postos preview when show_checkpoint_map is true and checkpoints exist", async ({
    page,
  }) => {
    await mockSettings(page, { show_checkpoint_map: true });
    await mockTeams(page);
    await mockCheckpoints(page, [
      { id: 1, name: "Posto 1", description: "First", latitude: 40.63, longitude: -8.65, order: 1 },
    ]);

    await page.goto("/rally/");
    await scrollThroughPage(page);

    await expect(page.locator("#postos-heading")).toBeVisible();
  });

  test("respects home_layout ordering and visibility overrides", async ({ page }) => {
    await mockSettings(page, {
      home_layout: [
        { key: "home_hero", visible: true },
        { key: "rally_marquee", visible: false },
        { key: "event_stats", visible: false },
        { key: "live_top5", visible: false },
        { key: "how_it_works", visible: false },
        { key: "postos_preview", visible: false },
        { key: "home_bottom_banner", visible: false },
      ],
    });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.locator("#home-hero-heading")).toBeVisible();
    await expect(page.locator("#top5-heading")).toHaveCount(0);
    await expect(page.locator("#postos-heading")).toHaveCount(0);
  });

  test("renders custom ticker items in marquee", async ({ page }) => {
    await mockSettings(page, { ticker_items: ["ÚNICO ITEM DE TESTE"] });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.getByText("ÚNICO ITEM DE TESTE").first()).toBeVisible();
  });

  test("redirects authenticated team to team-progress", async ({ page }) => {
    await mockSettings(page);
    await page.addInitScript(() => {
      localStorage.setItem("rally_team_token", "team-jwt");
      localStorage.setItem(
        "rally_team_data",
        JSON.stringify({ team_id: 3, team_name: "Os Fixes" }),
      );
    });
    // main.tsx fires a team-token refresh on every load; on failure it clears
    // the team session, flaking any test slow enough for that fetch to resolve.
    await page.route("**/api/rally/v1/team-auth/refresh", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "team-jwt" }),
      }),
    );
    await page.route("**/api/rally/v1/team/3**", (route) =>
      route.fulfill({
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
      }),
    );

    await page.goto("/rally/");

    await page.waitForURL("**/team-progress");
    await expect(page).not.toHaveURL(/\/rally\/$/);
  });

  test("gates whole site behind LandingGate when public_access_enabled is false", async ({
    page,
  }) => {
    await mockSettings(page, { public_access_enabled: false });
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
    await expect(page.locator("#home-hero-heading")).toHaveCount(0);
  });

  test("degrades gracefully when settings API errors", async ({ page }) => {
    await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Server error" }),
      }),
    );
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    // Should not crash — layout shows loading/gate rather than throwing.
    await expect(page.locator("body")).toBeVisible();
  });

  test("renders correctly on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page);
    await mockTeams(page);
    await mockCheckpoints(page);

    await page.goto("/rally/");

    await expect(page.locator("#home-hero-heading")).toBeVisible();
  });
});
