import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { seedOidcSession, ADMIN_GROUPS } from "./helpers/session";
import { MOCK_RALLY_SETTINGS } from "../mocks/data";

async function mockPublicSettings(page: Page) {
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RALLY_SETTINGS),
    }),
  );
}

function adminSettings(overrides: Record<string, unknown> = {}) {
  return {
    ...MOCK_RALLY_SETTINGS,
    participant_view_enabled: false,
    show_route_mode: "focused",
    allow_photo_as_team_photo: false,
    guide_mode_enabled: false,
    guide_mode_active: false,
    badges_enabled: true,
    home_layout: [],
    ticker_items: [],
    ...overrides,
  };
}

async function mockAdminSettings(page: Page, settings = adminSettings()) {
  await page.route("**/api/rally/v1/rally/settings", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(settings),
      });
    }
    return route.fallback();
  });
}

async function gotoSettingsInEditMode(page: Page) {
  // The settings page reorg dropped the separate view/edit toggle — the form
  // is always editable. The Save/Cancel bar only mounts once a change makes
  // the form dirty, so just wait for the page itself to be ready.
  await page.goto("/rally/settings");
  await page.getByRole("heading", { name: "Configurações", exact: true }).waitFor();
}

/** Only the active section's fields are mounted — switch to it before
 *  touching a field that doesn't live in the default "Jogo" section. */
async function openSection(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function captureSave(page: Page): Promise<() => unknown> {
  let capturedBody: unknown;
  await page.route("**/api/rally/v1/rally/settings", (route) => {
    if (route.request().method() === "PUT") {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(capturedBody),
      });
    }
    return route.fallback();
  });
  return () => capturedBody;
}

test.describe("Settings toggle matrix", () => {
  test("toggling show_live_leaderboard off and saving sends false", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_live_leaderboard: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#show_live_leaderboard)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { show_live_leaderboard?: boolean })?.show_live_leaderboard)
      .toBe(false);
    expect(getBody()).toBeDefined();
  });

  test("toggling show_team_details off and saving sends false", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_team_details: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#show_team_details)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { show_team_details?: boolean })?.show_team_details)
      .toBe(false);
    expect(getBody()).toBeDefined();
  });

  test("toggling show_checkpoint_map off and saving sends false", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_checkpoint_map: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#show_checkpoint_map)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { show_checkpoint_map?: boolean })?.show_checkpoint_map)
      .toBe(false);
    expect(getBody()).toBeDefined();
  });

  test("enabling participant_view_enabled and saving sends true", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ participant_view_enabled: false }));
    const getBody = await captureSave(page);

    // participant_view_enabled lives in "Jogo", the default active section.
    await gotoSettingsInEditMode(page);
    await page.locator("label:has(#participant_view_enabled)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { participant_view_enabled?: boolean })?.participant_view_enabled)
      .toBe(true);
    expect(getBody()).toBeDefined();
  });

  test('changing show_route_mode to "complete" saves the new value', async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_route_mode: "focused" }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("#show_route_mode").click();
    await page.getByRole("option", { name: "Trajeto completo" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { show_route_mode?: string })?.show_route_mode)
      .toBe("complete");
    expect(getBody()).toBeDefined();
  });

  test('changing show_score_mode to "competitive" saves the new value', async ({
    page,
    context,
  }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_score_mode: "hidden" }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("#show_score_mode").click();
    await page.getByRole("option", { name: "Classificação completa" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { show_score_mode?: string })?.show_score_mode)
      .toBe("competitive");
    expect(getBody()).toBeDefined();
  });

  test("enabling public_access_enabled and saving sends true", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ public_access_enabled: false }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#public_access_enabled)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { public_access_enabled?: boolean })?.public_access_enabled)
      .toBe(true);
    expect(getBody()).toBeDefined();
  });

  test("toggling guide_mode_enabled and guide_mode_active independently", async ({
    page,
    context,
  }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(
      page,
      adminSettings({ guide_mode_enabled: false, guide_mode_active: false }),
    );
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#guide_mode_enabled)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { guide_mode_enabled?: boolean })?.guide_mode_enabled)
      .toBe(true);
    await expect
      .poll(() => (getBody() as { guide_mode_active?: boolean })?.guide_mode_active)
      .toBe(false);
    expect(getBody()).toBeDefined();
  });

  test("disabling badges_enabled and saving sends false", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ badges_enabled: true }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#badges_enabled)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { badges_enabled?: boolean })?.badges_enabled)
      .toBe(false);
    expect(getBody()).toBeDefined();
  });

  test("toggling allow_photo_as_team_photo and saving sends true", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ allow_photo_as_team_photo: false }));
    const getBody = await captureSave(page);

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#allow_photo_as_team_photo)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(() => (getBody() as { allow_photo_as_team_photo?: boolean })?.allow_photo_as_team_photo)
      .toBe(true);
    expect(getBody()).toBeDefined();
  });

  test("canceling edit mode discards unsaved toggle changes", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_live_leaderboard: true }));

    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    const toggle = page.locator("#show_live_leaderboard");
    await page.locator("label:has(#show_live_leaderboard)").click();
    await expect(toggle).not.toBeChecked();

    await page.getByRole("button", { name: "Cancelar" }).click();

    await expect(toggle).toBeChecked();
  });

  test("save error shows a toast and keeps edit mode open", async ({ page, context }) => {
    await mockPublicSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockAdminSettings(page, adminSettings({ show_live_leaderboard: true }));
    await page.route("**/api/rally/v1/rally/settings", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Server error" }),
        });
      }
      return route.fallback();
    });

    // The Save bar only mounts once the form is dirty.
    await gotoSettingsInEditMode(page);
    await openSection(page, "Visualização");
    await page.locator("label:has(#show_live_leaderboard)").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    // getErrorMessage prefers the API's error.body.detail over the fallback
    // string, so the toast shows the server's message, not the generic one.
    await expect(page.getByText("Server error")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
  });
});
