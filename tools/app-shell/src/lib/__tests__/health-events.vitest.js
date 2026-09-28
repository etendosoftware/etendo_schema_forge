import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Module mocks (must be hoisted before any import of the module under test) ──

vi.mock('@/lib/observability.js', () => ({
  track: vi.fn().mockResolvedValue(undefined),
  flush: vi.fn().mockResolvedValue(undefined),
  group: vi.fn(),
  groupSet: vi.fn().mockResolvedValue(undefined),
  identify: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import {
  trackDocumentCreated,
  trackTransactionPosted,
  trackSessionStarted,
} from '@/lib/observability/health-events.js';
import { track, flush, group, groupSet, identify } from '@/lib/observability.js';
import {
  clearSessionIdentity,
  getSessionIdentity,
  setSessionIdentity,
} from '@/lib/sessionIdentity.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
    configurable: true,
  });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearSessionIdentity();
});

// ── trackDocumentCreated ───────────────────────────────────────────────────────

describe('trackDocumentCreated', () => {
  it('calls track("document_created") with correct document_type and functional_area for a mapped window', () => {
    setPathname('/sales-invoice/some-record-id');

    trackDocumentCreated();

    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('document_created', expect.objectContaining({
      document_type: 'sales_invoice',
      functional_area: 'sales',
    }));
  });

  it('is a no-op for an unmapped window name', () => {
    setPathname('/nonexistent-window/123');

    trackDocumentCreated();

    expect(track).not.toHaveBeenCalled();
  });

  it('is a no-op when pathname is empty (no window resolved)', () => {
    setPathname('/');

    trackDocumentCreated();

    expect(track).not.toHaveBeenCalled();
  });

  // ETP-5455: the account comes from the session identity. It used to be read from the legacy
  // sf_auth_client_id key, which nothing writes since the cookie session, so every event lost
  // its account grouping.
  it('includes account_id from the session identity', () => {
    setPathname('/sales-order/abc');
    setSessionIdentity({ clientId: 'client-42' });

    trackDocumentCreated();

    expect(track).toHaveBeenCalledWith('document_created', expect.objectContaining({
      account_id: 'client-42',
    }));
  });

  it('ignores a leftover legacy sf_auth_client_id key', () => {
    setPathname('/sales-order/abc');
    localStorage.setItem('sf_auth_client_id', 'stale-client');

    trackDocumentCreated();

    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('account_id');
  });

  it('does NOT pass user_email in the payload', () => {
    setPathname('/sales-invoice/abc');

    trackDocumentCreated();

    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('user_email');
  });

  it('does NOT pass document_id in the payload', () => {
    setPathname('/sales-invoice/abc');

    trackDocumentCreated();

    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('document_id');
  });

  it('emits correct fields for a non-transactional window (contacts)', () => {
    setPathname('/contacts');

    trackDocumentCreated();

    expect(track).toHaveBeenCalledWith('document_created', expect.objectContaining({
      document_type: 'contact_created',
      functional_area: 'contacts',
    }));
  });

  it('emits correct fields for a stock window (goods-movements)', () => {
    setPathname('/goods-movements/rec-id');

    trackDocumentCreated();

    expect(track).toHaveBeenCalledWith('document_created', expect.objectContaining({
      document_type: 'stock_movement',
      functional_area: 'stock',
    }));
  });

  it('uses explicit windowName arg instead of URL when provided', () => {
    setPathname('/sales-order/123');

    trackDocumentCreated('goods-shipment');

    expect(track).toHaveBeenCalledWith('document_created', expect.objectContaining({
      document_type: 'delivery_note',
      functional_area: 'sales',
    }));
  });

  it('is a no-op when explicit windowName arg is unmapped', () => {
    setPathname('/sales-order/123');

    trackDocumentCreated('nonexistent-window');

    expect(track).not.toHaveBeenCalled();
  });
});

// ── getSessionContext / getWindowName error branches ────────────────────────────

describe('resilience to environment errors', () => {
  it('trackDocumentCreated omits session context when localStorage.getItem throws', () => {
    setPathname('/sales-invoice/rec');
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked');
    });

    trackDocumentCreated();

    // getSessionContext swallows the error and returns {}, so track still fires
    // with the base document fields but no account_id/username keys spread in.
    expect(track).toHaveBeenCalledOnce();
    const [, props] = track.mock.calls[0];
    expect(props.document_type).toBe('sales_invoice');
    expect(props).not.toHaveProperty('account_id');
    getItem.mockRestore();
  });

  it('trackTransactionPosted resolves the window to a no-op when extractWindowName throws', () => {
    // A getter that throws on access simulates extractWindowName blowing up on a
    // malformed pathname; getWindowName catches it and returns undefined → no map hit.
    Object.defineProperty(window, 'location', {
      value: { get pathname() { throw new Error('bad location'); } },
      writable: true,
      configurable: true,
    });

    expect(() => trackTransactionPosted()).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});

// ── trackTransactionPosted ─────────────────────────────────────────────────────

describe('trackTransactionPosted', () => {
  it('calls track("transaction_posted") with correct fields for a transactional window', () => {
    setPathname('/sales-order/some-id');

    trackTransactionPosted();

    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('transaction_posted', expect.objectContaining({
      document_type: 'sales_order',
      functional_area: 'sales',
    }));
  });

  it('does NOT fire for sales-quotation (transactional: false)', () => {
    setPathname('/sales-quotation/some-id');

    trackTransactionPosted();

    expect(track).not.toHaveBeenCalled();
  });

  it('does NOT fire for contacts (transactional: false)', () => {
    setPathname('/contacts');

    trackTransactionPosted();

    expect(track).not.toHaveBeenCalled();
  });

  it('is a no-op for an unmapped window', () => {
    setPathname('/nonexistent-window/123');

    trackTransactionPosted();

    expect(track).not.toHaveBeenCalled();
  });

  it('does NOT pass user_email in the payload', () => {
    setPathname('/purchase-order/rec-id');

    trackTransactionPosted();

    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('user_email');
  });

  it('does NOT pass document_id in the payload', () => {
    setPathname('/purchase-order/rec-id');

    trackTransactionPosted();

    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('document_id');
  });

  // ETP-5455: from the session identity (was the legacy sf_auth_client_id key).
  it('includes account_id from the session identity', () => {
    setPathname('/sales-invoice/rec-id');
    setSessionIdentity({ clientId: 'tenant-99' });

    trackTransactionPosted();

    expect(track).toHaveBeenCalledWith('transaction_posted', expect.objectContaining({
      account_id: 'tenant-99',
    }));
  });

  it('emits correct fields for a purchase window (purchase-invoice)', () => {
    setPathname('/purchase-invoice/rec-id');

    trackTransactionPosted();

    expect(track).toHaveBeenCalledWith('transaction_posted', expect.objectContaining({
      document_type: 'supplier_invoice',
      functional_area: 'purchases',
    }));
  });

  it('emits correct fields for a stock window (physical-inventory)', () => {
    setPathname('/physical-inventory/rec-id');

    trackTransactionPosted();

    expect(track).toHaveBeenCalledWith('transaction_posted', expect.objectContaining({
      document_type: 'inventory_adjustment',
      functional_area: 'stock',
    }));
  });
});

// ── trackSessionStarted ────────────────────────────────────────────────────────

describe('trackSessionStarted', () => {
  it('calls group("account_id", clientId) when clientId is provided', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(group).toHaveBeenCalledOnce();
    expect(group).toHaveBeenCalledWith('account_id', 'client-123');
  });

  it('calls track("session_started") with account_id only (no username — GDPR remediation)', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(track).toHaveBeenCalledWith('session_started', {
      account_id: 'client-123',
    });
    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('username');
  });

  it('calls flush() after tracking', async () => {
    await trackSessionStarted({ username: 'bob', clientId: 'c-1' });

    expect(flush).toHaveBeenCalledOnce();
  });

  it('does NOT call group() when clientId is undefined', async () => {
    await trackSessionStarted({ username: 'bob', clientId: undefined });

    expect(group).not.toHaveBeenCalled();
  });

  it('does NOT call group() when clientId is an empty string', async () => {
    await trackSessionStarted({ username: 'bob', clientId: '' });

    expect(group).not.toHaveBeenCalled();
  });

  it('does NOT pass user_email in the track payload', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'c-2' });

    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('user_email');
  });

  it('does NOT pass document_id in the track payload', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'c-2' });

    const [, props] = track.mock.calls[0];
    expect(props).not.toHaveProperty('document_id');
  });

  it('resolves without error when called with no arguments', async () => {
    await expect(trackSessionStarted()).resolves.toBeUndefined();
    expect(track).toHaveBeenCalledWith('session_started', {
      account_id: undefined,
    });
  });

  it('still calls track and flush even without clientId', async () => {
    await trackSessionStarted({ username: 'charlie' });

    expect(track).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
  });

  // identify() used to be called on every login (session_started) — removed entirely as part
  // of the ETP-4352 GDPR remediation. Regression guard: it must stay gone regardless of whether
  // a username is provided.
  it('does NOT call identify() even when username is provided', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(identify).not.toHaveBeenCalled();
  });

  it('does NOT call identify() when username is absent', async () => {
    await trackSessionStarted({ clientId: 'client-123' });

    expect(identify).not.toHaveBeenCalled();
  });

  it('does NOT call identify() when username is undefined', async () => {
    await trackSessionStarted({ username: undefined, clientId: 'client-123' });

    expect(identify).not.toHaveBeenCalled();
  });

  it('calls groupSet with $name when clientName is provided', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123', clientName: 'Acme Corp' });

    expect(groupSet).toHaveBeenCalledOnce();
    expect(groupSet).toHaveBeenCalledWith('account_id', 'client-123', { $name: 'Acme Corp' });
  });

  // ETP-5455: the fallback name comes from the session identity (was the legacy
  // sf_auth_client_name key), for the same client only.
  it('calls groupSet with $name from the session identity when clientName is not passed', async () => {
    setSessionIdentity({ clientId: 'client-123', clientName: 'Stored Corp' });

    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(groupSet).toHaveBeenCalledOnce();
    expect(groupSet).toHaveBeenCalledWith('account_id', 'client-123', { $name: 'Stored Corp' });
  });

  it('does NOT call groupSet when clientName is absent and localStorage is empty', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(groupSet).not.toHaveBeenCalled();
  });
});

// ── ETP-5455 — trackSessionStarted feeds and reads the session identity ─────────

describe('trackSessionStarted and the session identity (ETP-5455)', () => {
  it('records who signed in, so later events and flag targeting know it', async () => {
    await trackSessionStarted({ username: 'ana', clientId: 'client-1', clientName: 'Acme' });

    expect(getSessionIdentity()).toEqual({ username: 'ana', clientId: 'client-1', clientName: 'Acme' });
  });

  it('names the account group from the session identity when the caller has no client name', async () => {
    setSessionIdentity({ clientId: 'client-1', clientName: 'Acme' });

    await trackSessionStarted({ username: 'ana', clientId: 'client-1' });

    expect(groupSet).toHaveBeenCalledWith('account_id', 'client-1', { $name: 'Acme' });
  });

  it('never falls back to the legacy sf_auth_client_name key', async () => {
    localStorage.setItem('sf_auth_client_name', 'Stale Tenant');

    await trackSessionStarted({ username: 'ana', clientId: 'client-9' });

    expect(groupSet).not.toHaveBeenCalledWith('account_id', 'client-9', { $name: 'Stale Tenant' });
  });
});
