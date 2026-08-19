import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { seedOidcSession, ADMIN_GROUPS } from "./helpers/session";
import { MOCK_RALLY_SETTINGS } from "../mocks/data";

async function mockSettings(page: Page) {
  await page.route("**/api/rally/v1/rally/settings/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RALLY_SETTINGS),
    }),
  );
}

async function mockActivities(page: Page) {
  await page.route("**/api/rally/v1/activities**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ activities: [{ id: 5, name: "Foto Criativa" }] }),
    });
  });
}

async function mockPending(page: Page, results: unknown[]) {
  await page.route("**/api/rally/v1/activities/deferred/pending", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(results) }),
  );
}

async function gotoJudging(page: Page) {
  await page.goto("/rally/admin?tab=judging");
}

const PENDING = [
  { id: 1, team_id: 3, activity_id: 5, media_urls: ["https://example.com/photo.jpg"] },
  { id: 2, team_id: 4, activity_id: 5, media_urls: [] },
];

test.describe("Admin judging", () => {
  test("shows empty state when there is nothing pending", async ({ page, context }) => {
    await mockSettings(page);
    await mockActivities(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, []);

    await gotoJudging(page);

    await expect(page.getByText("Sem julgamentos pendentes")).toBeVisible();
  });

  test("groups pending results by activity and shows team ids and photo thumbnails", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await mockActivities(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, PENDING);

    await gotoJudging(page);

    await expect(page.getByText("Foto Criativa")).toBeVisible();
    await expect(page.getByText("Equipa #3")).toBeVisible();
    await expect(page.getByText("Equipa #4")).toBeVisible();
    await expect(page.getByAltText("Foto 1 da equipa #3")).toBeVisible();
  });

  test("result without photos shows the no-photos fallback", async ({ page, context }) => {
    await mockSettings(page);
    await mockActivities(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, [{ id: 2, team_id: 4, activity_id: 5, media_urls: [] }]);

    await gotoJudging(page);

    await expect(page.getByText("Sem fotos")).toBeVisible();
  });

  test("reordering and confirming submits the ranking and clears the group", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await mockActivities(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    let pendingCallCount = 0;
    await page.route("**/api/rally/v1/activities/deferred/pending", (route) => {
      pendingCallCount += 1;
      const body = pendingCallCount === 1 ? PENDING : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    let capturedBody: unknown;
    await page.route("**/api/rally/v1/activities/deferred/5/rank", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await gotoJudging(page);
    await expect(page.getByText("Foto Criativa")).toBeVisible();

    await page.getByLabel("Subir equipa #4").click();
    await page.getByText("Confirmar ordenação").click();

    await expect.poll(() => capturedBody).toEqual({ ordered_result_ids: [2, 1] });
    await expect(page.getByText("Sem julgamentos pendentes")).toBeVisible();
  });

  test("shows an error message when submitting the ranking fails", async ({ page, context }) => {
    await mockSettings(page);
    await mockActivities(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockPending(page, PENDING);
    await page.route("**/api/rally/v1/activities/deferred/5/rank", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Server error" }),
      }),
    );

    await gotoJudging(page);
    await expect(page.getByText("Foto Criativa")).toBeVisible();
    await page.getByText("Confirmar ordenação").click();

    await expect(page.getByText("Erro ao submeter a ordenação. Tenta novamente.")).toBeVisible();
  });
});
