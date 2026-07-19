import { describe, test, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Router from '@/router/index';

function renderRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>,
  );
}

describe('Router', () => {
  test('renders without crashing at the app root', async () => {
    window.history.pushState({}, '', '/rally/');
    expect(() => renderRouter()).not.toThrow();
    await waitFor(() => {
      expect(document.body.innerHTML.length).toBeGreaterThan(0);
    });
  });

  test('mounts the RouterProvider and resolves a non-root route', async () => {
    window.history.pushState({}, '', '/rally/rules');
    expect(() => renderRouter()).not.toThrow();
    await waitFor(() => {
      expect(document.body.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
