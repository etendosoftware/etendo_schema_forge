import { describe, it, expect } from 'vitest';
import { clearAccountIdentity, readSessionContext } from '../bootstrap.js';

/**
 * ETP-5202 — the cached account identity is not part of the core's session storage, so
 * nothing else clears it. Leaving it behind on a shared computer means the next person's
 * browser still names the previous account, and anything reading the cache to answer
 * "who is signed in" answers with somebody who signed out.
 */
function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe('clearAccountIdentity', () => {
  it('removes both cached account identity keys', () => {
    const storage = makeStorage({
      sf_account_id: 'ACC-1',
      sf_account_email: 'someone@example.com',
    });

    clearAccountIdentity(storage);

    expect(storage.getItem('sf_account_id')).toBeNull();
    expect(storage.getItem('sf_account_email')).toBeNull();
    expect(readSessionContext(storage)).toEqual({
      username: undefined,
      clientId: undefined,
      accountId: undefined,
      accountEmail: undefined,
    });
  });

  it('leaves unrelated keys untouched', () => {
    const storage = makeStorage({
      sf_account_id: 'ACC-1',
      sf_account_email: 'someone@example.com',
      sf_auth_user: 'admin',
      sf_auth_client_id: 'CLIENT-1',
      sf_platform_token: 'platform-jwt',
    });

    clearAccountIdentity(storage);

    expect(storage.getItem('sf_auth_user')).toBe('admin');
    expect(storage.getItem('sf_auth_client_id')).toBe('CLIENT-1');
    expect(storage.getItem('sf_platform_token')).toBe('platform-jwt');
  });

  it('is a no-op when the keys are already absent', () => {
    const storage = makeStorage({ sf_auth_user: 'admin' });

    expect(() => clearAccountIdentity(storage)).not.toThrow();
    expect(storage.getItem('sf_auth_user')).toBe('admin');
  });

  // Storage can be unavailable (Safari private mode, a blocked third-party context). There is
  // nothing to fall back to, so the failure must stay silent rather than break the logout path.
  it('does not throw when storage access throws', () => {
    const hostile = {
      removeItem: () => {
        throw new Error('storage disabled');
      },
    };

    expect(() => clearAccountIdentity(hostile)).not.toThrow();
  });

  it('does not throw when no storage is available', () => {
    expect(() => clearAccountIdentity(null)).not.toThrow();
    expect(() => clearAccountIdentity(undefined)).not.toThrow();
  });
});
