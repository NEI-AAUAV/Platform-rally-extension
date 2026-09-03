import { test, expect } from "@playwright/test";
import { API_BASE_URL, apiCall, apiMultipart, mintToken } from "./helpers/fullstackAuth";
import { createAndActivateEvent, waitForApi } from "./helpers/seedRally";

function pngFile(name: string): File {
  return new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68])],
    name,
    { type: "image/png" },
  );
}

async function assertObjectReachable(url: string): Promise<void> {
  const response = await fetch(url);
  expect(response.ok, `${url} should exist`).toBeTruthy();
}

async function assertObjectMissing(url: string): Promise<void> {
  const response = await fetch(url);
  expect(response.status, `${url} should be gone`).toBe(404);
}

test.describe("Object storage fullstack", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await waitForApi();
  });

  test("stores, replaces, preserves and deletes checkpoint assets in S3-compatible storage", async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-storage-admin-${runId}`,
      name: "E2E Storage Admin",
      groups: ["admin"],
      email: `e2e-storage-admin-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, "storage");

    const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
      token: admin.accessToken,
      body: { name: `Storage CP ${runId}`, order: 1, clue: "segue a seta" },
    });

    const clueForm = new FormData();
    clueForm.set("image", pngFile("clue.png"));
    const clue = await apiMultipart<{ clue_media_url: string }>(
      "PUT",
      `/checkpoint/${checkpoint.id}/clue-image`,
      { token: admin.accessToken, form: clueForm },
    );
    await assertObjectReachable(clue.clue_media_url);

    const mediaCreate = new FormData();
    mediaCreate.set("kind", "photo");
    mediaCreate.set("order", "0");
    mediaCreate.set("image", pngFile("first.png"));
    const media = await apiMultipart<{ id: number; image_url: string }>(
      "POST",
      `/checkpoint/${checkpoint.id}/media`,
      { token: admin.accessToken, form: mediaCreate },
    );
    await assertObjectReachable(media.image_url);

    const mediaReplace = new FormData();
    mediaReplace.set("image", pngFile("second.png"));
    const replaced = await apiMultipart<{ image_url: string }>(
      "PUT",
      `/checkpoint/media/${media.id}`,
      { token: admin.accessToken, form: mediaReplace },
    );
    expect(replaced.image_url).not.toBe(media.image_url);
    await assertObjectReachable(replaced.image_url);
    await assertObjectMissing(media.image_url);

    const brokenReplace = new FormData();
    brokenReplace.set("image", pngFile("broken.png"));
    brokenReplace.set("content_url", "https://example.com/not-allowed-on-photo");
    const failed = await fetch(`${API_BASE_URL}/api/rally/v1/checkpoint/media/${media.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      body: brokenReplace,
    });
    expect(failed.status, await failed.text()).toBe(422);

    const listed = await apiCall<{ id: number; image_url: string }[]>(
      "GET",
      `/checkpoint/${checkpoint.id}/media`,
      { token: admin.accessToken },
    );
    expect(listed[0]?.image_url).toBe(replaced.image_url);
    await assertObjectReachable(replaced.image_url);

    const brandForm = new FormData();
    brandForm.set("image", pngFile("banner.png"));
    const branding = await apiMultipart<{ banner_url: string }>("PUT", "/rally/settings/banner", {
      token: admin.accessToken,
      form: brandForm,
    });
    await assertObjectReachable(branding.banner_url);

    const brandReplaceForm = new FormData();
    brandReplaceForm.set("image", pngFile("logo.png"));
    const logo = await apiMultipart<{ logo_url: string }>("PUT", "/rally/settings/logo", {
      token: admin.accessToken,
      form: brandReplaceForm,
    });
    await assertObjectReachable(logo.logo_url);

    await apiCall("DELETE", `/checkpoint/media/${media.id}`, { token: admin.accessToken });
    await assertObjectMissing(replaced.image_url);
  });

  test("stores deferred judging media, promotes team photo, and supports direct team uploads", async () => {
    const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = await mintToken({
      sub: `e2e-storage-admin-${runId}`,
      name: "E2E Storage Admin",
      groups: ["admin"],
      email: `e2e-storage-admin-${runId}@ua.pt`,
    });
    await createAndActivateEvent(admin, "storage-media");

    const checkpoint = await apiCall<{ id: number }>("POST", "/checkpoint/", {
      token: admin.accessToken,
      body: { name: `Media CP ${runId}`, order: 1, arrival_radius_m: 9999 },
    });
    const activity = await apiCall<{ id: number }>("POST", "/activities/", {
      token: admin.accessToken,
      body: {
        name: `Deferred ${runId}`,
        activity_type: "DeferredJudgedActivity",
        checkpoint_id: checkpoint.id,
        config: { min_points: 0, max_points: 100 },
        is_active: true,
      },
    });
    const team = await apiCall<{ id: number }>("POST", "/team/", {
      token: admin.accessToken,
      body: { name: `Storage Team ${runId}` },
    });

    const userSearch = await apiCall<{ id: number }[]>(
      "GET",
      `/user/search?q=${encodeURIComponent(`e2e-storage-admin-${runId}@ua.pt`)}`,
      { token: admin.accessToken },
    );
    await apiCall("PUT", `/user/${userSearch[0]!.id}/checkpoint-assignment`, {
      token: admin.accessToken,
      body: { checkpoint_id: checkpoint.id },
    });

    const captureForm = new FormData();
    captureForm.append("images", pngFile("capture-a.png"));
    captureForm.append("images", pngFile("capture-b.png"));
    const captured = await apiMultipart<{ id: number; media_urls: string[] }>(
      "POST",
      `/activities/deferred/${activity.id}/capture?team_id=${team.id}`,
      { token: admin.accessToken, form: captureForm },
    );
    expect(captured.media_urls).toHaveLength(2);
    await Promise.all(captured.media_urls.map(assertObjectReachable));

    // Promoting an activity photo to the team's official one is off by
    // default, and settings are per-edition: the event created above starts
    // with its own row, so the capability has to be switched on here.
    const settings = await apiCall<Record<string, unknown>>("GET", "/rally/settings", {
      token: admin.accessToken,
    });
    await apiCall("PUT", "/rally/settings", {
      token: admin.accessToken,
      body: { ...settings, allow_photo_as_team_photo: true },
    });

    const promoted = await apiCall<{ photo_url: string }>(
      "PUT",
      `/activities/results/${captured.id}/set-team-photo`,
      { token: admin.accessToken, body: { image_url: captured.media_urls[0] } },
    );
    expect(promoted.photo_url).toBe(captured.media_urls[0]);
    await assertObjectReachable(promoted.photo_url);

    const teamPhotoForm = new FormData();
    teamPhotoForm.set("image", pngFile("team-photo.png"));
    const teamPhoto = await apiMultipart<{ photo_url: string }>(
      "PUT",
      `/team/${team.id}/photo`,
      { token: admin.accessToken, form: teamPhotoForm },
    );
    await assertObjectReachable(teamPhoto.photo_url);
    await assertObjectMissing(promoted.photo_url);
  });
});
