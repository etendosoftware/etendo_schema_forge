// @covers tools/app-shell/src/lib/sessionIdentity.js
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearSessionIdentity,
  getSessionIdentity,
  getSessionIdentityEpoch,
  setSessionIdentity,
} from '../sessionIdentity.js';

/**
 * ETP-5455 — who is signed in, for the plain modules that are not React components and cannot
 * call `useAuth()` (feature-flag targeting, Mixpanel grouping). They used to read the legacy
 * `sf_auth_user` / `sf_auth_client_id` / `sf_auth_client_name` keys, which nothing writes since
 * the cookie session — so targeting and grouping silently fell back to "anonymous". The identity
 * now lives in memory, fed by the session itself.
 */
describe('sessionIdentity', () => {
  afterEach(() => {
    clearSessionIdentity();
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(getSessionIdentity()).toEqual({});
  });

  it('returns what was set', () => {
    setSessionIdentity({ username: 'ana', clientId: 'client-1', clientName: 'Acme' });

    expect(getSessionIdentity()).toEqual({ username: 'ana', clientId: 'client-1', clientName: 'Acme' });
  });

  it('keeps the known client name when a later update for the same client omits it', () => {
    setSessionIdentity({ username: 'ana', clientId: 'client-1', clientName: 'Acme' });
    setSessionIdentity({ username: 'ana', clientId: 'client-1' });

    expect(getSessionIdentity().clientName).toBe('Acme');
  });

  it('forgets the client name when the client changes, so it never labels the wrong tenant', () => {
    setSessionIdentity({ username: 'ana', clientId: 'client-1', clientName: 'Acme' });
    setSessionIdentity({ username: 'ana', clientId: 'client-2' });

    expect(getSessionIdentity()).toEqual({ username: 'ana', clientId: 'client-2' });
  });

  it('is cleared on logout', () => {
    setSessionIdentity({ username: 'ana', clientId: 'client-1' });

    clearSessionIdentity();

    expect(getSessionIdentity()).toEqual({});
  });

  it('never touches the legacy localStorage keys', () => {
    setSessionIdentity({ username: 'ana', clientId: 'client-1', clientName: 'Acme' });

    expect(localStorage.getItem('sf_auth_user')).toBeNull();
    expect(localStorage.getItem('sf_auth_client_id')).toBeNull();
    expect(localStorage.getItem('sf_auth_client_name')).toBeNull();
  });

  it('returns a copy, so a caller cannot mutate the shared identity', () => {
    setSessionIdentity({ username: 'ana', clientId: 'client-1' });

    getSessionIdentity().clientId = 'tampered';

    expect(getSessionIdentity().clientId).toBe('client-1');
  });
});


describe('session identity epochs for asynchronous ownership', () => {
  afterEach(() => clearSessionIdentity());

  it('keeps repeated publication and client-name enrichment in the same epoch', () => {
    setSessionIdentity({ username: 'ana', clientId: 'company-a' });
    const epoch = getSessionIdentityEpoch();
    setSessionIdentity({ username: 'ana', clientId: 'company-a', clientName: 'Current Name' });
    setSessionIdentity({ username: 'ana', clientId: 'company-a' });
    expect(getSessionIdentityEpoch()).toBe(epoch);
    expect(getSessionIdentity().clientName).toBe('Current Name');
  });

  it('invalidates the previous company epoch even when switching back to the same fields', () => {
    setSessionIdentity({ username: 'ana', clientId: 'company-a' });
    const epoch = getSessionIdentityEpoch();
    setSessionIdentity({ username: 'ana', clientId: 'company-b' });
    setSessionIdentity({ username: 'ana', clientId: 'company-a' });
    expect(getSessionIdentityEpoch()).toBeGreaterThan(epoch);
    expect(getSessionIdentity()).toEqual({ username: 'ana', clientId: 'company-a' });
  });

  it('invalidates the previous login even when the same user and company return', () => {
    setSessionIdentity({ username: 'ana', clientId: 'company-a' });
    const epoch = getSessionIdentityEpoch();
    clearSessionIdentity();
    setSessionIdentity({ username: 'ana', clientId: 'company-a' });
    expect(getSessionIdentityEpoch()).toBeGreaterThan(epoch);
  });

  it('invalidates pending work for a reset of an already empty session', () => {
    clearSessionIdentity();
    const epoch = getSessionIdentityEpoch();
    clearSessionIdentity();
    expect(getSessionIdentityEpoch()).toBeGreaterThan(epoch);
    expect(getSessionIdentity()).toEqual({});
  });
});
