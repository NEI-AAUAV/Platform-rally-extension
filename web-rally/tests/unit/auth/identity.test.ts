import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config', () => ({
  default: {
    OIDC_ADMIN_GROUP: 'admin',
    OIDC_MANAGER_GROUP: 'manager-rally',
    OIDC_STAFF_GROUP: 'rally-staff',
    OIDC_GUIDE_GROUP: 'rally-guide',
  },
}));

import { mapGroupsToScopes, profileToUser } from '@/auth/identity';
import type { User } from 'oidc-client-ts';

describe('mapGroupsToScopes', () => {
  it('returns an empty array when groups is undefined', () => {
    expect(mapGroupsToScopes(undefined)).toEqual([]);
  });

  it('returns an empty array when groups is empty', () => {
    expect(mapGroupsToScopes([])).toEqual([]);
  });

  it('maps admin group to admin scope', () => {
    expect(mapGroupsToScopes(['admin'])).toEqual(['admin']);
  });

  it('maps manager group to manager-rally scope', () => {
    expect(mapGroupsToScopes(['manager-rally'])).toEqual(['manager-rally']);
  });

  it('maps staff group to rally-staff scope', () => {
    expect(mapGroupsToScopes(['rally-staff'])).toEqual(['rally-staff']);
  });

  it('maps guide group to rally-guide scope', () => {
    expect(mapGroupsToScopes(['rally-guide'])).toEqual(['rally-guide']);
  });

  it('maps multiple groups to multiple scopes in a stable order', () => {
    expect(mapGroupsToScopes(['rally-guide', 'admin', 'rally-staff', 'manager-rally'])).toEqual([
      'admin',
      'manager-rally',
      'rally-staff',
      'rally-guide',
    ]);
  });

  it('ignores unrecognized groups', () => {
    expect(mapGroupsToScopes(['some-other-group'])).toEqual([]);
  });
});

describe('profileToUser', () => {
  const baseUser = (profile: Record<string, unknown>) => ({ profile }) as unknown as User;

  it('maps a full profile to a TokenPayload', () => {
    const user = baseUser({
      sub: 'uuid-1',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/pic.png',
      groups: ['admin'],
    });

    const result = profileToUser(user);
    expect(result).toEqual({
      sub: 'uuid-1',
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://example.com/pic.png',
      scopes: ['admin'],
    });
  });

  it('falls back to preferred_username when name is missing', () => {
    const user = baseUser({
      sub: 'uuid-2',
      preferred_username: 'testuser',
      groups: [],
    });

    const result = profileToUser(user);
    expect(result.name).toBe('testuser');
  });

  it('handles a profile with no groups', () => {
    const user = baseUser({ sub: 'uuid-3' });
    const result = profileToUser(user);
    expect(result.scopes).toEqual([]);
  });

  it('handles a profile with no name and no preferred_username', () => {
    const user = baseUser({ sub: 'uuid-4', groups: [] });
    const result = profileToUser(user);
    expect(result.name).toBeUndefined();
  });
});
