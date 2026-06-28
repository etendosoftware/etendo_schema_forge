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

  it('includes account_id from localStorage when sf_auth_client_id is set', () => {
    setPathname('/sales-order/abc');
    localStorage.setItem('sf_auth_client_id', 'client-42');

    trackDocumentCreated();

    expect(track).toHaveBeenCalledWith('document_created', expect.objectContaining({
      account_id: 'client-42',
    }));
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

  it('includes account_id from localStorage when sf_auth_client_id is set', () => {
    setPathname('/sales-invoice/rec-id');
    localStorage.setItem('sf_auth_client_id', 'tenant-99');

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

  it('calls track("session_started") with username and account_id', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(track).toHaveBeenCalledWith('session_started', {
      username: 'alice',
      account_id: 'client-123',
    });
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
      username: undefined,
      account_id: undefined,
    });
  });

  it('still calls track and flush even without clientId', async () => {
    await trackSessionStarted({ username: 'charlie' });

    expect(track).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
  });

  it('calls identify(username) when username is provided', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(identify).toHaveBeenCalledOnce();
    expect(identify).toHaveBeenCalledWith('alice');
  });

  it('does NOT call identify() when username is absent', async () => {
    await trackSessionStarted({ clientId: 'client-123' });

    expect(identify).not.toHaveBeenCalled();
  });

  it('does NOT call identify() when username is undefined', async () => {
    await trackSessionStarted({ username: undefined, clientId: 'client-123' });

    expect(identify).not.toHaveBeenCalled();
  });

  it('calls identify() before track() to attribute the session event to the identified user', async () => {
    const callOrder = [];
    identify.mockImplementation(() => { callOrder.push('identify'); return Promise.resolve(undefined); });
    track.mockImplementation(() => { callOrder.push('track'); return Promise.resolve(undefined); });

    await trackSessionStarted({ username: 'bob', clientId: 'c-1' });

    expect(callOrder.indexOf('identify')).toBeLessThan(callOrder.indexOf('track'));
  });

  it('calls groupSet with $name when clientName is provided', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123', clientName: 'Acme Corp' });

    expect(groupSet).toHaveBeenCalledOnce();
    expect(groupSet).toHaveBeenCalledWith('account_id', 'client-123', { $name: 'Acme Corp' });
  });

  it('calls groupSet with $name from localStorage sf_auth_client_name when clientName not passed but localStorage is set', async () => {
    localStorage.setItem('sf_auth_client_name', 'Stored Corp');

    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(groupSet).toHaveBeenCalledOnce();
    expect(groupSet).toHaveBeenCalledWith('account_id', 'client-123', { $name: 'Stored Corp' });
  });

  it('does NOT call groupSet when clientName is absent and localStorage is empty', async () => {
    await trackSessionStarted({ username: 'alice', clientId: 'client-123' });

    expect(groupSet).not.toHaveBeenCalled();
  });
});
