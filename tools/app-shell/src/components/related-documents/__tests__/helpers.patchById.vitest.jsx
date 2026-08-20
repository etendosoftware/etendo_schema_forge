import { describe, it, expect, vi, beforeEach } from 'vitest';
import { patchById } from '../helpers.js';
import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
} from '@/test/sessionContract.js';

// ETP-4888 — patchById is the cross-spec PATCH-by-id sibling of fetchById,
// first consumed by TaxSifModal.jsx to save a tax record's SIF fields from an
// invoice-line quick-fix modal. It mirrors fetchById's neoBase() segment-swap
// (see helpers.js), but unlike fetchById, errors are NOT swallowed — a failed
// write must reject so the caller can toast it.

function mockFetchOnce(impl) {
  globalThis.fetch = vi.fn(impl);
}

beforeEach(() => {
  vi.restoreAllMocks();
  // ETP-4576: `patchById` no longer takes a token — the credential comes from
  // the active session scheme. Bearer is the production default.
  declareBearerSession();
});

describe('patchById — URL construction (mirrors fetchById/neoBase segment-swap)', () => {
  it('swaps the calling window spec segment for the target spec/entity/id', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'tax-1' }] } }) }));

    await patchById('tax', 'tax', 'tax-1', { EM_Tbai_Claveregimeniva: '05' }, '/sws/neo/sales-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/tax/tax/tax-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('swaps correctly regardless of which window spec is calling (purchase-invoice)', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'tax-1' }] } }) }));

    await patchById('tax', 'tax', 'tax-1', {}, '/sws/neo/purchase-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith('/sws/neo/tax/tax/tax-1', expect.anything());
  });

  it('handles a nested apiBaseUrl path (neoBase strips only the last segment)', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{}] } }) }));

    await patchById('tax', 'tax', 'tax-9', {}, '/etendo/sws/neo/sales-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith('/etendo/sws/neo/tax/tax/tax-9', expect.anything());
  });
});

describe('patchById — method, headers, body', () => {
  it('sends PATCH with the bearer token + JSON content-type + JSON-stringified payload', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'tax-1' }] } }) }));
    const payload = { EM_Tbai_Claveregimeniva: '05' };

    await patchById('tax', 'tax', 'tax-1', payload, '/sws/neo/sales-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith('/sws/neo/tax/tax/tax-1', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TEST_BEARER_TOKEN}`, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  });

  // The other half of the switch, on the one WRITE in this module. PATCH is an
  // unsafe method, so the cookie scheme has to attach the CSRF proof — without
  // it this call answers 403 the moment the preference goes on, and no
  // bearer-only test can see that.
  it('sends PATCH with the CSRF proof and no bearer token under the cookie scheme', async () => {
    declareCookieSession();
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'tax-1' }] } }) }));
    const payload = { EM_Tbai_Claveregimeniva: '05' };

    await patchById('tax', 'tax', 'tax-1', payload, '/sws/neo/sales-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith('/sws/neo/tax/tax/tax-1', {
      method: 'PATCH',
      headers: { 'X-Go-CSRF': TEST_CSRF_TOKEN, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  });
});

describe('patchById — success handling', () => {
  it('resolves with response.data[0] on success', async () => {
    const record = { id: 'tax-1', EM_Tbai_Claveregimeniva: '05' };
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [record] } }) }));

    const result = await patchById('tax', 'tax', 'tax-1', {}, '/sws/neo/sales-invoice');

    expect(result).toEqual(record);
  });

  it('resolves with null when response.data is an empty array', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) }));

    const result = await patchById('tax', 'tax', 'tax-1', {}, '/sws/neo/sales-invoice');

    expect(result).toBeNull();
  });

  it('resolves with null when the response envelope is missing entirely', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    const result = await patchById('tax', 'tax', 'tax-1', {}, '/sws/neo/sales-invoice');

    expect(result).toBeNull();
  });
});

describe('patchById — error handling (errors are NOT swallowed, unlike fetchById)', () => {
  it('rejects with the server text message when the response is not ok', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: false, status: 400, text: async () => 'Invalid regime code' }));

    await expect(patchById('tax', 'tax', 'tax-1', {}, '/sws/neo/sales-invoice'))
      .rejects.toThrow('Invalid regime code');
  });

  it('rejects with a generic "Request failed (status)" message when the error body is empty', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: false, status: 500, text: async () => '' }));

    await expect(patchById('tax', 'tax', 'tax-1', {}, '/sws/neo/sales-invoice'))
      .rejects.toThrow('Request failed (500)');
  });

  it('propagates a network-level rejection (fetch itself throws) instead of resolving to null', async () => {
    mockFetchOnce(() => Promise.reject(new Error('network down')));

    await expect(patchById('tax', 'tax', 'tax-1', {}, '/sws/neo/sales-invoice'))
      .rejects.toThrow('network down');
  });
});
