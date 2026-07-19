import { describe, it, expect, afterEach, vi } from 'vitest';

describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses localhost/http defaults outside production', async () => {
    const { default: config } = await import('@/config');
    expect(config.PRODUCTION).toBe(false);
    expect(config.HOST).toBe('localhost');
    expect(config.BASE_URL).toBe('http://localhost');
  });

  it('resolves production host/scheme when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { default: config } = await import('@/config');
    expect(config.PRODUCTION).toBe(true);
    expect(config.HOST).toBe('nei.web.ua.pt');
    expect(config.BASE_URL).toBe('https://nei.web.ua.pt');
  });

  it('exposes OIDC group and events config with sane defaults', async () => {
    const { default: config } = await import('@/config');
    expect(typeof config.OIDC_ADMIN_GROUP).toBe('string');
    expect(typeof config.OIDC_REDIRECT_URI).toBe('string');
    expect(typeof config.EVENTS_ENABLED).toBe('boolean');
  });

  it('disables EVENTS_ENABLED when VITE_EVENTS_ENABLED is "false"', async () => {
    vi.stubEnv('VITE_EVENTS_ENABLED', 'false');
    vi.resetModules();
    const { default: config } = await import('@/config');
    expect(config.EVENTS_ENABLED).toBe(false);
  });

  it('honors explicit VITE_OIDC_* overrides instead of the defaults', async () => {
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'https://auth.example.com');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'my-client');
    vi.stubEnv('VITE_OIDC_REDIRECT_URI', 'https://example.com/callback');
    vi.stubEnv('VITE_OIDC_POST_LOGOUT_REDIRECT_URI', 'https://example.com/logout');
    vi.stubEnv('VITE_OIDC_ADMIN_GROUP', 'custom-admin');
    vi.stubEnv('VITE_OIDC_MANAGER_GROUP', 'custom-manager');
    vi.stubEnv('VITE_OIDC_STAFF_GROUP', 'custom-staff');
    vi.stubEnv('VITE_OIDC_GUIDE_GROUP', 'custom-guide');
    vi.resetModules();
    const { default: config } = await import('@/config');
    expect(config.OIDC_AUTHORITY).toBe('https://auth.example.com');
    expect(config.OIDC_CLIENT_ID).toBe('my-client');
    expect(config.OIDC_REDIRECT_URI).toBe('https://example.com/callback');
    expect(config.OIDC_POST_LOGOUT_REDIRECT_URI).toBe('https://example.com/logout');
    expect(config.OIDC_ADMIN_GROUP).toBe('custom-admin');
    expect(config.OIDC_MANAGER_GROUP).toBe('custom-manager');
    expect(config.OIDC_STAFF_GROUP).toBe('custom-staff');
    expect(config.OIDC_GUIDE_GROUP).toBe('custom-guide');
  });
});
