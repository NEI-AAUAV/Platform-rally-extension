import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Open a Radix Select (rendered as `role="combobox"`) and pick an option by
 * its accessible name.
 *
 * Callers must pass `combobox` as a plain attribute locator (e.g.
 * `row.locator('button[role="combobox"]')`), not `row.getByRole("combobox")`.
 * Confirmed via trace (`outerHTML` still showed `role="combobox"
 * aria-expanded="true"` on the exact button) that once the trigger opens,
 * Playwright's accessibility-tree role query for it can stop matching —
 * every later `getByRole("combobox")` call against the same element then
 * hangs to its full timeout with "element(s) not found", even though the
 * element is genuinely present and open. `locator('[role="combobox"]')`
 * reads the DOM attribute directly and isn't affected.
 *

 * Clicking the trigger occasionally lands while the *previous* Select's
 * dismiss-layer is still unmounting: the click is swallowed, `aria-expanded`
 * never flips to `"true"`, and the option search below hangs for the full
 * action timeout since the option genuinely never renders (confirmed via
 * trace: `data-state="closed"` at the moment the wait gave up). Bumping the
 * timeout doesn't help a click that was never delivered, so this retries
 * the click until `aria-expanded` flips to `"true"` before searching for
 * the option.
 *
 * Both steps of an attempt — the click and the `aria-expanded` check — must
 * be inside the retry loop's `try`. Leaving the click unguarded let its own
 * timeout (the trigger row not yet stable/actionable, same underlying race)
 * escape the loop on attempt 1 and fail the whole call instead of retrying.
 *
 * `timeoutMs` defaults to 5s (each retry re-probes quickly), but callers
 * driving the real (non-mocked) fullstack backend need more room per
 * attempt: a row that's still waiting on its own data fetch can take longer
 * than 5s to become actionable at all, which starved every attempt instead
 * of just the first. Widening this was previously done inline at the call
 * site (25s, see git history) before this helper existed; that widening was
 * silently lost when the call sites were consolidated here. Pass an
 * explicit `timeoutMs` for any caller against the real backend.
 *
 * The option click is inside the same retry loop as the trigger open, not
 * a one-shot call after it: the same dismiss-layer/portal race that can
 * swallow the trigger click can also detach the option mid-click once the
 * trigger *does* open reliably (confirmed via CI trace — "element was
 * detached from the DOM, retrying" on the option, not the trigger, on
 * every attempt for the full timeout). A failed option click re-opens the
 * combobox from scratch on the next attempt rather than re-querying a
 * stale option locator, since closing may have been part of what failed.
 */
export async function selectComboboxOption(
  page: Page,
  combobox: Locator,
  optionName: string,
  timeoutMs = 5_000,
): Promise<void> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // `force: true` on the *retry* attempts (2+) only: a previous Select's
      // dismiss-layer can leave a full-screen, invisible overlay in the DOM
      // that intercepts the next click's hit-test — Playwright's normal
      // actionability check then waits out the full timeout for an overlay
      // that never moves, rather than for a target that becomes clickable.
      // `force` skips that hit-test and dispatches straight to the trigger,
      // confirmed via trace: the target had `data-state="closed"` for the
      // entire wait, i.e. the click genuinely never reached it. Not used on
      // attempt 1, so a real actionability problem (row not yet rendered)
      // still surfaces normally first.
      //
      // `force` also skips Playwright's own auto-scroll-into-view (part of
      // its actionability check). Pages that accumulate many rows over a
      // long single-worker suite run can have the target start off-screen,
      // so a force click on a retry can dispatch to a trigger that was
      // never scrolled into view and silently miss — confirmed via trace:
      // `aria-expanded` stuck at "false" for the full wait on every retry,
      // not just the first. Scroll explicitly first so force-clicking never
      // depends on the checks it's bypassing.
      await combobox.scrollIntoViewIfNeeded({ timeout: timeoutMs });
      await combobox.click({ timeout: timeoutMs, force: attempt > 1 });
      await expect(combobox).toHaveAttribute("aria-expanded", "true", { timeout: timeoutMs });
      await page.getByRole("option", { name: optionName }).click({ timeout: timeoutMs });
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      // The combobox may have closed as part of whatever failed (a detached
      // option, an intercepted click) — best-effort nudge it shut so the
      // next attempt's open click starts from a known "closed" state
      // instead of possibly toggling an already-open one closed.
      await combobox.press("Escape").catch(() => {});
    }
  }
}
