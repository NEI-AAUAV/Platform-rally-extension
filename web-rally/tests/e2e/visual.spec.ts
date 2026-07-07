import { test, expect, type Page } from '@playwright/test';
import { MOCK_RALLY_SETTINGS } from '../mocks/data';

/**
 * Visual regression for the universal-branding surfaces.
 *
 * The Landing Gate is the deliberate Phase 6 redesign and the surface where
 * branding-as-data (event name/subtitle, accent color, logo monogram, banner)
 * is most visible. It has no live-ticking content, so its rendering is
 * deterministic and safe to pin with screenshot baselines.
 *
 * The scoreboard is intentionally NOT screenshotted here: it renders a
 * per-second RallyTimeBanner countdown that has no stable test hook to mask,
 * which would make any pixel baseline flaky. Its behavior is covered by the
 * functional specs in scoreboard.spec.ts.
 *
 * Baselines are committed under visual.spec.ts-snapshots/. Regenerate with:
 *   pnpm test:e2e --update-snapshots tests/e2e/visual.spec.ts
 */

// Branding lives on the public settings payload. The Landing Gate only shows
// when the visitor is unauthenticated AND public access is disabled, so we mock
// settings accordingly and navigate to a non-public path.
const FALLBACK_SETTINGS = {
  ...MOCK_RALLY_SETTINGS,
  public_access_enabled: false,
};

const BRANDED_SETTINGS = {
  ...FALLBACK_SETTINGS,
  event_name: 'Carnaval 2026',
  event_subtitle: 'Edição Especial Tascas',
  accent_color: '#dc2626',
  // No logo_url so the deterministic monogram ("C2") renders instead of a
  // network image, keeping the baseline self-contained.
};

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

async function gotoLanding(page: Page, settings: object): Promise<void> {
  await page.route('**/api/rally/v1/rally/settings/public**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(settings),
    });
  });

  // No token + non-public path + public access disabled => Landing Gate renders.
  await page.goto('/rally/scoreboard', { waitUntil: 'domcontentloaded' });
  await page
    .waitForResponse('**/api/rally/v1/rally/settings/public**')
    .catch(() => null);
  await page.waitForLoadState('networkidle');
  // Settle entry transitions before capturing.
  await new Promise((resolve) => setTimeout(resolve, 500));
}

test.describe('Landing Gate visual regression', () => {
  for (const bp of BREAKPOINTS) {
    test(`branded @ ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await gotoLanding(page, BRANDED_SETTINGS);

      await expect(page.getByRole('heading', { name: 'Carnaval 2026' })).toBeVisible();
      await expect(page).toHaveScreenshot(`landing-branded-${bp.name}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
      });
    });

    test(`fallback @ ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await gotoLanding(page, FALLBACK_SETTINGS);

      await expect(page).toHaveScreenshot(`landing-fallback-${bp.name}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
