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
 *
 * `timeoutMs` defaults to 25s rather than Playwright's own 15s action
 * timeout: every other wait in this suite against the real (non-mocked)
 * backend after a page navigation uses 20-30s (see selectComboboxOption,
 * peddy-paper-aveiro.spec.ts), and this is typically called right after
 * `page.goto("/rally/assignment" | "/rally/guide-assignment")` — the
 * search box itself doesn't exist until that navigation's first render
 * completes, which can occasionally run past 15s under CI load.
 */
export async function searchAssignmentRow(
  page: Page,
  email: string,
  timeoutMs = 25_000,
): Promise<Locator> {
  const searchBox = page.getByPlaceholder("Procurar por nome ou email…");
  await expect(searchBox).toBeVisible({ timeout: timeoutMs });
  await searchBox.fill(email);

  const row = page
    .locator("div.rounded-xl")
    .filter({ has: page.getByText(email, { exact: false }) });
  // Covers the search debounce (300ms) plus a real (non-mocked) fetch.
  await expect(row).toBeVisible({ timeout: timeoutMs });
  return row;
}
