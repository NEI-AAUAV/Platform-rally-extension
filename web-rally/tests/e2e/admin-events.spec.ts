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

function event(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: "Rally Tascas 2026",
    event_type: "rally_tascas",
    description: null,
    start_time: null,
    end_time: null,
    is_current: false,
    ...overrides,
  };
}

async function mockEvents(page: Page, events: unknown[]) {
  await page.route("**/api/rally/v1/events", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(events),
      });
    }
    return route.fallback();
  });
}

async function gotoEvents(page: Page) {
  await page.goto("/rally/admin?tab=events");
}

test.describe("Admin events", () => {
  test("shows empty state when no editions exist", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, []);

    await gotoEvents(page);

    await expect(page.getByText("Sem edições")).toBeVisible();
  });

  test("creates a new edition of type peddy_paper", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, []);
    let capturedBody: unknown;
    await page.route("**/api/rally/v1/events", (route) => {
      if (route.request().method() === "POST") {
        capturedBody = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(event(capturedBody as Record<string, unknown>)),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await gotoEvents(page);
    await page.getByRole("button", { name: "Novo" }).click();
    await page.locator("#ev-name").fill("Peddy Paper 2027");
    await page.locator("#ev-type").click();
    await page.getByRole("option", { name: "Peddy-paper" }).click();
    await page.getByRole("button", { name: /Criar/ }).click();

    await expect.poll(() => (capturedBody as { name?: string })?.name).toBe("Peddy Paper 2027");
    await expect
      .poll(() => (capturedBody as { event_type?: string })?.event_type)
      .toBe("peddy_paper");
    expect(capturedBody).toBeDefined();
  });

  test("marks a non-current edition as current", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, [event({ id: 2, name: "Rally Tascas 2025", is_current: false })]);
    let setCurrentCalled = false;
    await page.route("**/api/rally/v1/events/2/set-current", (route) => {
      setCurrentCalled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(event({ id: 2, is_current: true })),
      });
    });

    await gotoEvents(page);
    await page.getByRole("button", { name: "Tornar atual" }).click();

    await expect.poll(() => setCurrentCalled).toBe(true);
    expect(setCurrentCalled).toBe(true);
  });

  test('current edition does not show "Tornar atual" and shows the Atual badge', async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, [event({ id: 3, name: "Rally Tascas 2026", is_current: true })]);

    await gotoEvents(page);

    await expect(page.getByText("Atual", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tornar atual" })).toHaveCount(0);
  });

  test("generates a rotation schedule only for olympic events", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, [
      event({ id: 4, name: "Jogos Olímpicos", event_type: "olympic" }),
      event({ id: 5, name: "Rally Genérico", event_type: "generic" }),
    ]);
    await page.route("**/api/rally/v1/events/4/rotation-schedule", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rounds: [[{ team_id: 1, checkpoint_id: 1 }], [{ team_id: 1, checkpoint_id: 2 }]],
        }),
      }),
    );

    await gotoEvents(page);

    await expect(page.getByRole("button", { name: "Gerar escalonamento" })).toHaveCount(1);
    await page.getByRole("button", { name: "Gerar escalonamento" }).click();

    await expect(page.getByText("2 rondas")).toBeVisible();
    await expect(page.getByText("Escalonamento olímpico gerado")).toBeVisible();
  });

  test("editing an edition pre-fills the form", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, [
      event({ id: 6, name: "Rally Antigo", description: "Edição de teste" }),
    ]);

    await gotoEvents(page);
    await page
      .getByRole("button")
      .filter({ has: page.locator(".lucide-pencil") })
      .click();

    await expect(page.locator("#ev-name")).toHaveValue("Rally Antigo");
    await expect(page.locator("#ev-desc")).toHaveValue("Edição de teste");
  });

  test("shows error state when editions fail to load", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await page.route("**/api/rally/v1/events", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Server error" }),
      }),
    );

    await gotoEvents(page);

    await expect(page.getByText("Não foi possível carregar as edições.")).toBeVisible();
  });
  test("deletes a test edition only after retyping its name", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, [
      event({ id: 1, name: "Rally Real", is_current: true }),
      event({ id: 9, name: "Teste QA" }),
    ]);
    let deleteBody: unknown = null;
    await page.route("**/api/rally/v1/events/9", (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deleteBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ event_id: 9, deleted: { teams: 2, checkpoints: 3 } }),
      });
    });

    await gotoEvents(page);
    // The current edition never offers delete.
    await expect(page.getByRole("button", { name: "Eliminar edição Rally Real" })).toHaveCount(0);
    await page.getByRole("button", { name: "Eliminar edição Teste QA" }).click();

    const confirm = page.getByRole("button", { name: "Eliminar edição", exact: true });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/para confirmar/).fill("Teste");
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/para confirmar/).fill("Teste QA");
    await confirm.click();

    await expect(page.getByText('Edição "Teste QA" eliminada (5 registos)')).toBeVisible();
    expect(deleteBody).toEqual({ confirm_name: "Teste QA" });
  });

  test("shows the server refusal inside the delete dialog", async ({ page, context }) => {
    await mockSettings(page);
    await seedOidcSession(context, ADMIN_GROUPS);
    await mockEvents(page, [event({ id: 9, name: "A decorrer" })]);
    await page.route("**/api/rally/v1/events/9", (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Não é possível eliminar uma edição com o rally a decorrer.",
        }),
      });
    });

    await gotoEvents(page);
    await page.getByRole("button", { name: "Eliminar edição A decorrer" }).click();
    await page.getByLabel(/para confirmar/).fill("A decorrer");
    await page.getByRole("button", { name: "Eliminar edição", exact: true }).click();

    await expect(page.getByRole("alert").filter({ hasText: "rally a decorrer" })).toBeVisible();
  });
});
