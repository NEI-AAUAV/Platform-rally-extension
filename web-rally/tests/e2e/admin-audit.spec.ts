import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { seedOidcSession, ADMIN_GROUPS } from "./helpers/session";
import { MOCK_RALLY_SETTINGS } from "../mocks/data";

async function mockSettings(page: Page) {
  await page.route("**/api/rally/v1/rally/settings**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...MOCK_RALLY_SETTINGS, public_access_enabled: true }),
    }),
  );
}

const MOCK_ENTRIES = [
  {
    id: 1,
    action: "badge.granted",
    target_type: "team_badge",
    target_id: "42",
    actor_kind: "staff",
    actor_name: "Staff A",
    note: "manual override",
    changes: { status: { before: "pending", after: "granted" } },
    created_at: "2026-07-20T10:00:00Z",
  },
];

async function mockAuditLog(page: Page) {
  await page.route("**/api/rally/v1/audit**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ENTRIES),
    }),
  );
}

async function gotoAudit(page: Page) {
  await page.goto("/rally/admin?tab=audit");
}

test.describe("Admin audit log", () => {
  test("loads and displays audit entries", async ({ page, context }) => {
    await mockSettings(page);
    await mockAuditLog(page);
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoAudit(page);

    await expect(page.getByText("badge.granted")).toBeVisible();
    await expect(page.getByText(/manual override/)).toBeVisible();
  });

  test("shows empty state when there are no entries for the current filters", async ({
    page,
    context,
  }) => {
    await mockSettings(page);
    await page.route("**/api/rally/v1/audit**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoAudit(page);

    await expect(page.getByText("Sem registos para os filtros atuais.")).toBeVisible();
  });

  test("shows an error message when the audit endpoint fails", async ({ page, context }) => {
    await mockSettings(page);
    await page.route("**/api/rally/v1/audit**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "boom" }),
      }),
    );
    await seedOidcSession(context, ADMIN_GROUPS);

    await gotoAudit(page);

    await expect(page.getByText("Não foi possível carregar a auditoria.")).toBeVisible();
  });
});
