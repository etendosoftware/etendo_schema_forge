// @covers tools/app-shell/src/lib/flags/useAccountIdentity.js
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ current: {} }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => auth.current }));
vi.mock('@/hooks/useNeoResource.js', () => ({ getApiBase: () => 'https://api' }));
const refreshAccountIdentity = vi.hoisted(() => vi.fn());
const setFeatureFlagContextMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const clearAccountIdentityMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const waitForIdentityResetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../bootstrap.js', () => ({
  refreshAccountIdentity,
  setFeatureFlagContext: setFeatureFlagContextMock,
  clearAccountIdentity: clearAccountIdentityMock,
  waitForIdentityReset: waitForIdentityResetMock,
}));

const setContextMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observability.js', () => ({ setContext: setContextMock }));

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
    waitForIdentityResetMock.mockReset();
    waitForIdentityResetMock.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => clearSessionIdentity());

  it('resolves the account identity under the cookie session, with no legacy key present', async () => {
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'client-1' };

    renderHook(() => useAccountIdentity());

    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalledTimes(1));
    expect(refreshAccountIdentity).toHaveBeenCalledWith({ token: null, apiBase: 'https://api', signal: expect.any(AbortSignal) });
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

  it('waits for the logout reset before assigning a newly authenticated identity', async () => {
    let releaseReset;
    waitForIdentityResetMock.mockReturnValueOnce(new Promise(resolve => { releaseReset = resolve; }));
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'client-1' };

    renderHook(() => useAccountIdentity());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getSessionIdentity()).toEqual({});

    releaseReset();
    await waitFor(() => expect(getSessionIdentity()).toEqual({ username: 'ana', clientId: 'client-1' }));
  });
});


describe('identity switches', () => {
  it('clears the previous account before resolving a switched tenant', async () => {
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'client-1' };
    const first = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalled());
    clearAccountIdentityMock.mockClear();
    auth.current = { token: null, isAuthenticated: true, username: 'bruno', clientId: 'client-2' };
    first.rerender();
    await waitFor(() => expect(clearAccountIdentityMock).toHaveBeenCalledTimes(1));
    expect(clearAccountIdentityMock.mock.invocationCallOrder[0]).toBeLessThan(refreshAccountIdentity.mock.invocationCallOrder.at(-1));
  });
});

describe('account-scoped flag targeting regressions', () => {
  const account = { id: 'ACC-1', email: 'ana@example.test', name: 'Ana' };

  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionIdentity();
    localStorage.clear();
    refreshAccountIdentity.mockResolvedValue({ accountId: account.id, accountEmail: account.email });
    auth.current = {
      token: null, isAuthenticated: true, username: 'erp-admin', clientId: 'company-1', account,
    };
  });

  afterEach(() => clearSessionIdentity());

  async function settleEffects() {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }

  it('uses the authenticated account without looking it up again through the tenant session', async () => {
    renderHook(() => useAccountIdentity());
    await settleEffects();

    expect(refreshAccountIdentity).not.toHaveBeenCalled();
    expect(setFeatureFlagContextMock).toHaveBeenCalledWith(expect.objectContaining({
      accountId: account.id, accountEmail: account.email, clientId: 'company-1',
    }));
  });

  it('does not resolve the same account again when only its bearer token rotates', async () => {
    auth.current = { ...auth.current, token: 'token-before', account: undefined };
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalledTimes(1));
    refreshAccountIdentity.mockClear();

    auth.current = { ...auth.current, token: 'token-after' };
    hook.rerender();
    await settleEffects();

    expect(refreshAccountIdentity).not.toHaveBeenCalled();
    expect(clearAccountIdentityMock).not.toHaveBeenCalled();
  });

  it('keeps the account while publishing the new company context', async () => {
    const hook = renderHook(() => useAccountIdentity());
    await settleEffects();
    vi.clearAllMocks();

    auth.current = { ...auth.current, clientId: 'company-2' };
    hook.rerender();
    await settleEffects();

    expect(clearAccountIdentityMock).not.toHaveBeenCalled();
    expect(refreshAccountIdentity).not.toHaveBeenCalled();
    expect(setFeatureFlagContextMock).toHaveBeenCalledWith(expect.objectContaining({
      accountId: account.id, accountEmail: account.email, clientId: 'company-2',
    }));
    expect(getSessionIdentity().clientId).toBe('company-2');
  });

  it('retargets when the authenticated account changes behind the same ERP user and company', async () => {
    const hook = renderHook(() => useAccountIdentity());
    await settleEffects();
    vi.clearAllMocks();
    const nextAccount = { id: 'ACC-2', email: 'bruno@example.test', name: 'Bruno' };

    auth.current = { ...auth.current, account: nextAccount };
    hook.rerender();
    await settleEffects();

    expect(clearAccountIdentityMock).toHaveBeenCalledTimes(1);
    expect(setFeatureFlagContextMock).toHaveBeenCalledWith(expect.objectContaining({
      accountId: nextAccount.id, accountEmail: nextAccount.email, clientId: 'company-1',
    }));
    expect(refreshAccountIdentity).not.toHaveBeenCalled();
  });
});


describe('unresolved legacy identity recovery', () => {
  it('retries after credential rotation only when the previous lookup failed', async () => {
    vi.clearAllMocks();
    refreshAccountIdentity.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ accountId: 'ACC-1' });
    auth.current = { token: 'expired-token', isAuthenticated: true, username: 'ana', clientId: 'company-1' };
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalledTimes(1));
    auth.current = { ...auth.current, token: 'renewed-token' };
    hook.rerender();
    await waitFor(() => expect(refreshAccountIdentity).toHaveBeenCalledTimes(2));
    expect(refreshAccountIdentity.mock.calls[1][0].token).toBe('renewed-token');
    auth.current = { ...auth.current, token: 'another-token' };
    hook.rerender();
    await act(async () => { await Promise.resolve(); });
    expect(refreshAccountIdentity).toHaveBeenCalledTimes(2);
  });

  it('sets internal_user from the account email domain, and clears it when unauthenticated (ETP-6230)', async () => {
    setContextMock.mockClear();
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'c1', account: { id: 'A', email: 'ana@etendo.software' } };
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(setContextMock).toHaveBeenLastCalledWith({ internal_user: true }));
    auth.current = { token: null, isAuthenticated: false };
    hook.rerender();
    await waitFor(() => expect(setContextMock).toHaveBeenLastCalledWith({ internal_user: undefined }));
  });

  it('ends on internal_user false after an internal account is replaced by an external one without logout (ETP-6230)', async () => {
    setContextMock.mockClear();
    auth.current = { token: null, isAuthenticated: true, username: 'ana', clientId: 'c1', account: { id: 'A', email: 'ana@etendo.ai' } };
    const hook = renderHook(() => useAccountIdentity());
    await waitFor(() => expect(setContextMock).toHaveBeenLastCalledWith({ internal_user: true }));
    auth.current = { token: null, isAuthenticated: true, username: 'bob', clientId: 'c1', account: { id: 'B', email: 'bob@gmail.com' } };
    hook.rerender();
    await waitFor(() => expect(setContextMock).toHaveBeenLastCalledWith({ internal_user: false }));
  });
});
