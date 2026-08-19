import { expect, type Page } from "@playwright/test";

/**
 * Asserts the header advertises a logged-out state.
 *
 * The login CTA renders inline in the header from the `sm` breakpoint up; on
 * narrower viewports (the `mobile` project) that block is hidden and the CTA
 * lives in the hamburger sidebar instead (see navigation/user-menu.tsx and
 * navigation/nav-tabs.tsx), so the menu has to be opened first.
 */
export async function expectLoggedOutLoginCta(page: Page): Promise<void> {
  const inlineCta = page.getByRole("button", { name: /iniciar sessão/i });
  const menuButton = page.getByRole("button", { name: "Abrir menu" });

  // Whichever renders for this viewport settles first; without this the check
  // below can run before the header has hydrated and find neither. 20s (not
  // the usual 10s) because a fully-parallel CI run of this spec saturates the
  // single preview server, and hydration can lag well past 10s under that
  // load without the app actually being broken (see staff-evaluation CI runs
  // where this timed out at 10s with 2 retries but a solo run passed easily).
  await expect(inlineCta.or(menuButton).first()).toBeVisible({ timeout: 20000 });
  if (await inlineCta.isVisible()) {
    return;
  }

  await menuButton.click();
  await expect(page.getByRole("button", { name: /iniciar sessão/i })).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Opens the admin sections nav so its tab buttons are reachable.
 *
 * Below the `lg` breakpoint (the `mobile` project) the sidebar in
 * admin/index.tsx is replaced by a "current tab" trigger that opens a
 * `<dialog>` drawer holding the actual nav buttons; the always-visible
 * desktop `<nav>` is CSS-hidden there instead. Call this before interacting
 * with any admin tab button so the same test body works on both projects.
 */
export async function openAdminNavIfMobile(page: Page): Promise<void> {
  const trigger = page.locator('button[aria-haspopup="menu"][aria-expanded]').first();
  // admin/index.tsx renders TWO <nav aria-label="Secções de administração">:
  // the drawer's (mobile) copy first in markup, nested in the same
  // `lg:hidden` wrapper as the trigger, then the always-in-DOM desktop copy
  // second. `.first()` here would pin to the drawer's — permanently
  // display:none on desktop — so both locators would wait out their full
  // timeout on every desktop call. `.last()` is the desktop one.
  const sidebar = page.locator('nav[aria-label="Secções de administração"]').last();

  // Callers navigate with `waitUntil: "domcontentloaded"`, so the SPA may not
  // have hydrated yet — an immediate `isVisible()` check races the trigger's
  // first paint and silently no-ops. Wait for whichever layout settles first
  // instead (mirrors expectLoggedOutLoginCta's approach for the same race).
  await Promise.race([
    trigger.waitFor({ state: "visible", timeout: 20000 }),
    sidebar.waitFor({ state: "visible", timeout: 20000 }),
  ]).catch(() => {});

  if (!(await trigger.isVisible().catch(() => false))) {
    return;
  }

  // A single `.click()` has occasionally left the drawer closed under CI
  // load — most likely the click landing before React finished attaching
  // the handler on a still-settling page. Verify the drawer actually opened
  // (aria-expanded flips to "true") and retry the click if not, rather than
  // trusting the click resolved and letting the caller's own assertion fail
  // downstream with no explanation.
  await expect(async () => {
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 2000 });
  }).toPass({ timeout: 15000 });
}
