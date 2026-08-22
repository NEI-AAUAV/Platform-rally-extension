import { test, expect } from "@playwright/test";
import { mintToken, seedRealOidcSession, apiCall } from "./helpers/fullstackAuth";
import { createAndActivateEvent, waitForApi } from "./helpers/seedRally";
import { mintStaffAssignedToCheckpoint } from "./helpers/seedGuideScenarioShared";

/**
 * One rule: **staff score at their own post, and nowhere else.**
 *
 * The rule itself — five write routes, both halves of the answer for each,
 * admins exempt, a missing activity still reading as 404 rather than as a
 * permission error — is asserted where it lives, against the real ABAC engine
 * over HTTP, in `api-rally/app/tests/api/test_activity_result_permissions.py`.
 * This file asserts the one thing that suite cannot see: what a staff member
 * who lands on another post's screen is actually told.
 *
 * That is not a hypothetical. The evaluation screen takes its post from the
 * URL, so a stale bookmark, a link passed around the staff group, or an id
 * typed by hand all get there. Before the guard added alongside this test, the
 * page rendered the other post in full and the refusal arrived as a toast on
 * the first submitted evaluation — after the team had already been put through
 * the challenge.
 */

test.describe("Quem pode registar uma avaliação, e onde", () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test("a staff member who deep-links to another post's evaluation screen is refused on screen", async ({
    page,
    context,
  }) => {
    // Both posts in *one* event: two events would each activate their own
    // edition, and the resulting "Posto não encontrado" would mask the thing
    // under test.
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-deeplink-admin-${runId}`,
      name: "E2E Deeplink Admin",
      groups: ["admin"],
      email: `e2e-deeplink-admin-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, `deeplink-${runId}`);

    const posts: { id: number; name: string }[] = [];
    for (const order of [1, 2]) {
      posts.push(
        await apiCall<{ id: number; name: string }>("POST", "/checkpoint/", {
          token: admin.accessToken,
          body: { name: `E2E Deeplink Posto ${order} ${runId}`, order, arrival_radius_m: 9999 },
        }),
      );
    }
    const [minePost, theirsPost] = posts;
    const staff = await mintStaffAssignedToCheckpoint(
      runId,
      "-deeplink",
      `deeplink-${runId}`,
      admin,
      minePost!.id,
    );
    await seedRealOidcSession(context, staff);

    await page.goto(`/rally/staff-evaluation/checkpoint/${theirsPost!.id}`);
    await expect(page.getByText("Este não é o teu posto")).toBeVisible({ timeout: 30_000 });
    // Named, so a staff member who followed the wrong link knows where to go
    // rather than only that they may not be here.
    await expect(page.getByText(minePost!.name)).toBeVisible();
    // Nothing of the other post's screen is offered: no team list, no scanner,
    // no announcement to its teams.
    await expect(page.getByRole("button", { name: "Ler QR da equipa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Avisar equipas/ })).toHaveCount(0);

    // One click puts them where they belong — and their own post's screen does
    // load, so the refusal above is the scoping and not a page that never works.
    await page.getByRole("button", { name: "Ir para o meu posto" }).click();
    await expect(page.getByRole("button", { name: "Ler QR da equipa" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Este não é o teu posto")).toHaveCount(0);
  });

  test("an admin reaches any post's evaluation screen", async ({ page, context }) => {
    // The guard narrows staff. Narrowing admins too would break the manager
    // view, whose whole purpose is walking every post from one screen.
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-deeplink-any-${runId}`,
      name: "E2E Deeplink Any",
      groups: ["admin"],
      email: `e2e-deeplink-any-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, `deeplink-any-${runId}`);
    const post = await apiCall<{ id: number }>("POST", "/checkpoint/", {
      token: admin.accessToken,
      body: { name: `E2E Deeplink Qualquer ${runId}`, order: 1, arrival_radius_m: 9999 },
    });
    await seedRealOidcSession(context, admin);

    await page.goto(`/rally/staff-evaluation/checkpoint/${post.id}`);
    await expect(page.getByText(`E2E Deeplink Qualquer ${runId}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Este não é o teu posto")).toHaveCount(0);
  });
});
