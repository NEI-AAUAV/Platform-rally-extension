import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { MOCK_RALLY_SETTINGS } from "../mocks/data";
import type { RallySettingsResponse } from "@/client";

async function mockSettings(page: Page, overrides: Partial<RallySettingsResponse> = {}) {
  const settings = { ...MOCK_RALLY_SETTINGS, ...overrides };
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) }),
  );
}

async function mockCheckpoints(page: Page, checkpoints: unknown[], status = 200) {
  await page.route("**/api/rally/v1/checkpoint/**", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(checkpoints) }),
  );
}

const CHECKPOINTS = [
  { id: 2, name: "Posto 2", description: "Second", latitude: 40.63, longitude: -8.65, order: 2 },
  { id: 1, name: "Posto 1", description: "First", latitude: 40.64, longitude: -8.66, order: 1 },
  { id: 3, name: "Posto 3", description: "Third", latitude: 40.65, longitude: -8.67, order: 3 },
];

test.describe("Postos", () => {
  test("lists checkpoints sorted by order when map is public", async ({ page }) => {
    await mockSettings(page, { show_checkpoint_map: true });
    await mockCheckpoints(page, CHECKPOINTS);

    await page.goto("/rally/checkpoints");

    const cards = page.getByText(/Posto \d/);
    await expect(cards.first()).toBeVisible();
    const texts = await cards.allTextContents();
    expect(texts.indexOf("Posto 1")).toBeLessThan(texts.indexOf("Posto 2"));
    expect(texts.indexOf("Posto 2")).toBeLessThan(texts.indexOf("Posto 3"));
  });

  test("shows empty state when there are no checkpoints", async ({ page }) => {
    await mockSettings(page, { show_checkpoint_map: true });
    await mockCheckpoints(page, []);

    await page.goto("/rally/checkpoints");

    await expect(page.getByText("Nenhum posto disponível")).toBeVisible();
  });

  test("redirects authenticated team to team-progress when map is not public", async ({ page }) => {
    await mockSettings(page, { show_checkpoint_map: false });
    await mockCheckpoints(page, CHECKPOINTS);
    await page.addInitScript(() => {
      localStorage.setItem("rally_team_token", "team-jwt");
      localStorage.setItem(
        "rally_team_data",
        JSON.stringify({ team_id: 3, team_name: "Os Fixes" }),
      );
    });
    await page.route("**/api/rally/v1/team-auth/refresh", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "team-jwt" }),
      }),
    );
    await page.route("**/api/rally/v1/team/**", (route) =>
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

    await page.goto("/rally/checkpoints");

    await page.waitForURL("**/team-progress");
    await expect(page).not.toHaveURL(/\/checkpoints/);
  });

  test("shows loading state while checkpoints are fetching", async ({ page }) => {
    await mockSettings(page, { show_checkpoint_map: true });
    await page.route("**/api/rally/v1/checkpoint/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(CHECKPOINTS),
      });
    });

    await page.goto("/rally/checkpoints");

    await expect(page.getByText("A carregar postos...")).toBeVisible();
  });

  test("heading and page render for unauthenticated public visitor", async ({ page }) => {
    await mockSettings(page, { show_checkpoint_map: true });
    await mockCheckpoints(page, CHECKPOINTS);

    await page.goto("/rally/checkpoints");

    await expect(page.getByText("O percurso")).toBeVisible();
  });

  test("renders correctly on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSettings(page, { show_checkpoint_map: true });
    await mockCheckpoints(page, CHECKPOINTS);

    await page.goto("/rally/checkpoints");

    await expect(page.getByText("Posto 1").first()).toBeVisible();
  });
});
