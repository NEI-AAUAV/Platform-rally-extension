import { test } from '@playwright/test';
import { seedOidcSession, ADMIN_GROUPS } from './helpers/session';
import { MOCK_RALLY_SETTINGS, MOCK_CHECKPOINT } from '../mocks/data';

test('debug5', async ({ page, context }) => {
  await page.route('**/api/rally/v1/rally/settings/public**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RALLY_SETTINGS) }),
  );
  await seedOidcSession(context, ADMIN_GROUPS);
  await page.route('**/api/rally/v1/checkpoint/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_CHECKPOINT]) }),
  );
  await page.route('**/api/rally/v1/activities/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Cabo de Guerra', description: '', activity_type: 'BooleanActivity', checkpoint_id: 1, config: {}, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]) }),
  );
  await page.goto('/rally/admin?tab=activities');
  await page.waitForTimeout(1500);
  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map((b) => ({
      text: b.textContent?.slice(0, 30),
      svgClasses: Array.from(b.querySelectorAll('svg')).map((s) => s.getAttribute('class')),
    })).filter((b) => b.svgClasses.length > 0);
  });
  console.log('BUTTONS', JSON.stringify(btns)); console.log('BODY TEXT', (await page.locator('main').innerText()).slice(0, 1500));
});
