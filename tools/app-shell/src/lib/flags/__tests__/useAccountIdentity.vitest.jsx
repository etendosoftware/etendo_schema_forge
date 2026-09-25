import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ current: {} }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => auth.current }));
vi.mock('@/hooks/useNeoResource.js', () => ({ getApiBase: () => 'https://api' }));
const refreshAccountIdentity = vi.hoisted(() => vi.fn());
vi.mock('../bootstrap.js', () => ({ refreshAccountIdentity }));

import { useAccountIdentity } from '../useAccountIdentity.js';
import { clearSessionIdentity, getSessionIdentity } from '../../sessionIdentity.js';

/**
 * ETP-5455 — the hook only ran when localStorage held `sf_platform_token`, which nothing writes
 * since the cookie session: under the cookie scheme it never ran, so flags were never targeted on
 * the account and the analytics identity stayed empty after every reload. It now runs for any
 * signed-in session, authenticating with whatever the session holds (the cookie travels on its
 * own; a legacy bearer session passes its token), and publishes who is signed in.
 */
describe('useAccountIdentity (ETP-5455)', () => {
  beforeEach(() => {
    refreshAccountIdentity.mockReset();
    refreshAccountIdentity.mockResolvedValue({ accountId: 'ACC-1' });
    localStorage.clear();
  });

  afterEach(() => clearSessionIdentity());

  it('resolves the account identity under the cookie session, with no legacy key present', async () => {
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'client-1' };

    renderHook(() => useAccountIdentity());

    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalledTimes(1));
    expect(refreshAccountIdentity).toHaveBeenCalledWith({ token: null, apiBase: 'https://api' });
  });

  it('publishes the signed-in identity for the plain modules (flags, analytics)', async () => {
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'client-1' };

    renderHook(() => useAccountIdentity());

    await waitFor(() => expect(getSessionIdentity()).toEqual({ username: 'ana', clientId: 'client-1' }));
  });

  it('passes a legacy bearer session its own token', async () => {
    auth.current = { token: 'env-jwt', isAuthenticated: true, username: 'ana', clientId: 'client-1' };

    renderHook(() => useAccountIdentity());

    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalledTimes(1));
    expect(refreshAccountIdentity.mock.calls[0][0].token).toBe('env-jwt');
  });

  it('does nothing before sign-in', async () => {
    auth.current = { token: null, isAuthenticated: false };

    renderHook(() => useAccountIdentity());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshAccountIdentity).not.toHaveBeenCalled();
    expect(getSessionIdentity()).toEqual({});
  });

  it('never reads the legacy sf_platform_token key', async () => {
    const getItem = vi.spyOn(globalThis.localStorage, 'getItem');
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'client-1' };

    renderHook(() => useAccountIdentity());

    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalled());
    expect(getItem).not.toHaveBeenCalledWith('sf_platform_token');
    getItem.mockRestore();
  });
});
