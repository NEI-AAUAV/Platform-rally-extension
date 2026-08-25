import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Open a Radix Select (rendered as `role="combobox"`) and pick an option by
 * its accessible name.
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
 */
export async function selectComboboxOption(
  page: Page,
  combobox: Locator,
  optionName: string,
): Promise<void> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await combobox.click({ timeout: 5_000 });
      await expect(combobox).toHaveAttribute("aria-expanded", "true", { timeout: 3_000 });
      break;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }
  }
  await page.getByRole("option", { name: optionName }).click();
}
