import { describe, it, expect, vi } from 'vitest'
import { oidcConfig } from '@/auth/oidcConfig'

describe('oidcConfig', () => {
  it('configures the PKCE scope and OIDC endpoints from config', () => {
    const cfg = oidcConfig as any;
    expect(cfg.scope).toBe('openid profile email offline_access')
    expect(cfg.automaticSilentRenew).toBe(true)
    expect(typeof cfg.authority).toBe('string')
    expect(typeof cfg.client_id).toBe('string')
    expect(typeof cfg.redirect_uri).toBe('string')
    expect(typeof cfg.post_logout_redirect_uri).toBe('string')
    expect(cfg.userStore).toBeDefined()
  })

  it('onSigninCallback strips OIDC response params from the URL', () => {
    const replaceStateSpy = vi.spyOn(globalThis.history, 'replaceState')
    oidcConfig.onSigninCallback?.({} as never)
    expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title, globalThis.location.pathname)
    replaceStateSpy.mockRestore()
  })
})
