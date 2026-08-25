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
 */
export async function selectComboboxOption(
  page: Page,
  combobox: Locator,
  optionName: string,
): Promise<void> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await combobox.click();
    try {
      await expect(combobox).toHaveAttribute("aria-expanded", "true", { timeout: 3_000 });
      break;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }
  }
  await page.getByRole("option", { name: optionName }).click();
}
