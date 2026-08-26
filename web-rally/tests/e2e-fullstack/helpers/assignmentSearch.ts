import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Find one row on `/rally/assignment` or `/rally/guide-assignment` by
 * typing into the page's search box rather than scrolling through
 * everyone.
 *
 * The candidate set behind both pages (GET /staff-assignments,
 * GET /guide-assignments) is every user who currently holds the
 * rally-staff/rally-guide role — unbounded over a deployment's life, and in
 * this suite specifically every synthetic user any earlier test in the same
 * single-worker CI job has minted (see UserService._mirrored_group_users on
 * the backend and AssignmentPager on the frontend). The API paginates that
 * list now, so a plain `getByText(email)` against the page can miss a row
 * that exists but isn't on the current page — searching by the target's own
 * (unique per test) email sidesteps pagination entirely instead of trying
 * to outguess how many pages there might be.
 */
export async function searchAssignmentRow(page: Page, email: string): Promise<Locator> {
  const searchBox = page.getByPlaceholder("Procurar por nome ou email…");
  await searchBox.fill(email);

  const row = page
    .locator("div.rounded-xl")
    .filter({ has: page.getByText(email, { exact: false }) });
  // 15s covers the search debounce (300ms) plus a real (non-mocked) fetch.
  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}
