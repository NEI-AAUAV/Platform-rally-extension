import type { Page, Route } from '@playwright/test';
import { assertMatchesOpenApiSchema } from './openapiValidator';

/**
 * Wraps page.route() + route.fulfill() with an openapi.json schema check on
 * the mocked body, so mocks that drift from the real API's documented
 * response shape fail the test instead of passing silently. `path` must be
 * the OpenAPI path template (e.g. "/api/rally/v1/team/{id}") so the
 * validator can look up the matching operation directly.
 */
export async function mockJson(
  page: Page,
  urlGlob: string,
  path: string,
  method: string,
  body: unknown,
  status = 200,
): Promise<void> {
  assertMatchesOpenApiSchema(body, path, method, status);

  await page.route(urlGlob, async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
