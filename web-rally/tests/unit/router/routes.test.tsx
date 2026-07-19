import { describe, test, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree, adminRoute, teamsRedirectRoute } from '@/router/routes';

function buildRouter(initialPath: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

function renderWithQueryClient(router: ReturnType<typeof buildRouter>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('routeTree structure', () => {
  test('root route has the auth callback route and the main layout route as children', () => {
    const router = createRouter({ routeTree });
    const routeIds = Object.keys(router.routesById);
    expect(routeIds).toContain('/auth/callback');
    expect(routeIds).toContain('/main');
  });

  test('main layout route contains all top-level app routes', () => {
    const router = createRouter({ routeTree });
    const routeIds = Object.keys(router.routesById);

    expect(routeIds).toEqual(
      expect.arrayContaining([
        '/main/',
        '/main/scoreboard',
        '/main/postos',
        '/main/rules',
        '/main/profile',
        '/main/teams',
        '/main/teams/$id',
        '/main/admin',
        '/main/assignment',
        '/main/guide-assignment',
        '/main/versus',
        '/main/team-login',
        '/main/team-progress',
        '/main/conquistas',
        '/main/settings',
        '/main/team-settings',
        '/main/team-info',
        '/main/team-members',
        '/main/staff-evaluation',
        '/main/staff-evaluation/checkpoint/$checkpointId',
        '/main/guide',
      ]),
    );
  });

  test('admin route validateSearch accepts a known tab id', () => {
    const validate = adminRoute.options.validateSearch as any;
    const result = validate?.({ tab: 'dashboard' });
    expect(result).toEqual({ tab: 'dashboard' });
  });

  test('admin route validateSearch drops an unknown tab id', () => {
    const validate = adminRoute.options.validateSearch as any;
    const result = validate?.({ tab: 'not-a-real-tab' });
    expect(result).toEqual({});
  });

  test('admin route validateSearch handles a missing tab key', () => {
    const validate = adminRoute.options.validateSearch as any;
    const result = validate?.({});
    expect(result).toEqual({});
  });

  test('admin route validateSearch handles a non-string tab value', () => {
    const validate = adminRoute.options.validateSearch as any;
    const result = validate?.({ tab: 42 });
    expect(result).toEqual({});
  });
});

describe('routeTree rendering', () => {
  test('resolves the auth callback route outside the main layout', async () => {
    const router = buildRouter('/auth/callback');
    renderWithQueryClient(router);
    await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 5000 });
    expect(router.state.matches.some((m) => m.routeId === '/auth/callback')).toBe(true);
    // The auth callback route should not go through the "main" layout route.
    expect(router.state.matches.some((m) => m.routeId === '/main')).toBe(false);
  });

  test('matches the teams route (which redirects to the scoreboard)', async () => {
    const router = buildRouter('/teams');
    renderWithQueryClient(router);
    await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 5000 });
    expect(router.state.matches.some((m) => m.routeId === '/main/teams')).toBe(true);
  });

  test('teams route component redirects to the scoreboard route', async () => {
    const isolatedRoot = createRootRoute();
    const isolatedTeamsRoute = createRoute({
      getParentRoute: () => isolatedRoot,
      path: '/teams',
      component: teamsRedirectRoute.options.component,
    });
    const isolatedScoreboardRoute = createRoute({
      getParentRoute: () => isolatedRoot,
      path: '/scoreboard',
      component: () => <div>scoreboard page</div>,
    });
    const isolatedRouteTree = isolatedRoot.addChildren([
      isolatedTeamsRoute,
      isolatedScoreboardRoute,
    ]);
    const router = createRouter({
      routeTree: isolatedRouteTree,
      history: createMemoryHistory({ initialEntries: ['/teams'] }),
    });
    render(<RouterProvider router={router} />);
    await waitFor(
      () => expect(router.state.location.pathname).toBe('/scoreboard'),
      { timeout: 5000 },
    );
  });

  test('resolves a parameterized route (team by id)', async () => {
    const router = buildRouter('/teams/abc123');
    renderWithQueryClient(router);
    await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 5000 });
    const match = router.state.matches.find((m) => m.routeId === '/main/teams/$id');
    expect(match).toBeDefined();
    expect(match?.params).toEqual({ id: 'abc123' });
  });

  test('resolves a nested parameterized route (checkpoint evaluation)', async () => {
    const router = buildRouter('/staff-evaluation/checkpoint/xyz');
    renderWithQueryClient(router);
    await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 5000 });
    const match = router.state.matches.find(
      (m) => m.routeId === '/main/staff-evaluation/checkpoint/$checkpointId',
    );
    expect(match).toBeDefined();
    expect(match?.params).toEqual({ checkpointId: 'xyz' });
  });

  test('preserves an allowed admin tab search param on navigation', async () => {
    const router = buildRouter('/admin?tab=events');
    renderWithQueryClient(router);
    await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 5000 });
    const match = router.state.matches.find((m) => m.routeId === '/main/admin');
    expect(match).toBeDefined();
    expect(match?.search).toEqual({ tab: 'events' });
  });

  test('matches the admin route even with a disallowed tab search param', async () => {
    const router = buildRouter('/admin?tab=bogus');
    renderWithQueryClient(router);
    await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 5000 });
    const match = router.state.matches.find((m) => m.routeId === '/main/admin');
    expect(match).toBeDefined();
  });

  test.each([
    ['/', '/main/'],
    ['/scoreboard', '/main/scoreboard'],
    ['/postos', '/main/postos'],
    ['/rules', '/main/rules'],
    ['/profile', '/main/profile'],
    ['/assignment', '/main/assignment'],
    ['/guide-assignment', '/main/guide-assignment'],
    ['/versus', '/main/versus'],
    ['/team-login', '/main/team-login'],
    ['/team-progress', '/main/team-progress'],
    ['/settings', '/main/settings'],
    ['/conquistas', '/main/conquistas'],
    ['/team-members', '/main/team-members'],
    ['/team-settings', '/main/team-settings'],
    ['/team-info', '/main/team-info'],
    ['/guide', '/main/guide'],
    ['/staff-evaluation', '/main/staff-evaluation'],
  ])('resolves the %s route to route id %s', async (path, expectedRouteId) => {
    const router = buildRouter(path);
    renderWithQueryClient(router);
    await waitFor(() => expect(router.state.status).toBe('idle'), { timeout: 5000 });
    expect(router.state.matches.some((m) => m.routeId === expectedRouteId)).toBe(true);
  });
});
