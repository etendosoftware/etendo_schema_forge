import { describe, it, expect, vi, beforeEach } from 'vitest';
import { patchById } from '../helpers.js';

// ETP-4888 — patchById is the cross-spec PATCH-by-id sibling of fetchById,
// first consumed by TaxSifModal.jsx to save a tax record's SIF fields from an
// invoice-line quick-fix modal. It mirrors fetchById's neoBase() segment-swap
// (see helpers.js), but unlike fetchById, errors are NOT swallowed — a failed
// write must reject so the caller can toast it.

const TOKEN = 'test-token';

function mockFetchOnce(impl) {
  globalThis.fetch = vi.fn(impl);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('patchById — URL construction (mirrors fetchById/neoBase segment-swap)', () => {
  it('swaps the calling window spec segment for the target spec/entity/id', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'tax-1' }] } }) }));

    await patchById('tax', 'tax', 'tax-1', { EM_Tbai_Claveregimeniva: '05' }, TOKEN, '/sws/neo/sales-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/tax/tax/tax-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('swaps correctly regardless of which window spec is calling (purchase-invoice)', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'tax-1' }] } }) }));

    await patchById('tax', 'tax', 'tax-1', {}, TOKEN, '/sws/neo/purchase-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith('/sws/neo/tax/tax/tax-1', expect.anything());
  });

  it('handles a nested apiBaseUrl path (neoBase strips only the last segment)', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{}] } }) }));

    await patchById('tax', 'tax', 'tax-9', {}, TOKEN, '/etendo/sws/neo/sales-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith('/etendo/sws/neo/tax/tax/tax-9', expect.anything());
  });
});

describe('patchById — method, headers, body', () => {
  it('sends PATCH with Authorization Bearer + JSON content-type + JSON-stringified payload', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'tax-1' }] } }) }));
    const payload = { EM_Tbai_Claveregimeniva: '05' };

    await patchById('tax', 'tax', 'tax-1', payload, TOKEN, '/sws/neo/sales-invoice');

    expect(globalThis.fetch).toHaveBeenCalledWith('/sws/neo/tax/tax/tax-1', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });
});

describe('patchById — success handling', () => {
  it('resolves with response.data[0] on success', async () => {
    const record = { id: 'tax-1', EM_Tbai_Claveregimeniva: '05' };
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [record] } }) }));

    const result = await patchById('tax', 'tax', 'tax-1', {}, TOKEN, '/sws/neo/sales-invoice');

    expect(result).toEqual(record);
  });

  it('resolves with null when response.data is an empty array', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) }));

    const result = await patchById('tax', 'tax', 'tax-1', {}, TOKEN, '/sws/neo/sales-invoice');

    expect(result).toBeNull();
  });

  it('resolves with null when the response envelope is missing entirely', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    const result = await patchById('tax', 'tax', 'tax-1', {}, TOKEN, '/sws/neo/sales-invoice');

    expect(result).toBeNull();
  });
});

describe('patchById — error handling (errors are NOT swallowed, unlike fetchById)', () => {
  it('rejects with the server text message when the response is not ok', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: false, status: 400, text: async () => 'Invalid regime code' }));

    await expect(patchById('tax', 'tax', 'tax-1', {}, TOKEN, '/sws/neo/sales-invoice'))
      .rejects.toThrow('Invalid regime code');
  });

  it('rejects with a generic "Request failed (status)" message when the error body is empty', async () => {
    mockFetchOnce(() => Promise.resolve({ ok: false, status: 500, text: async () => '' }));

    await expect(patchById('tax', 'tax', 'tax-1', {}, TOKEN, '/sws/neo/sales-invoice'))
      .rejects.toThrow('Request failed (500)');
  });

  it('propagates a network-level rejection (fetch itself throws) instead of resolving to null', async () => {
    mockFetchOnce(() => Promise.reject(new Error('network down')));

    await expect(patchById('tax', 'tax', 'tax-1', {}, TOKEN, '/sws/neo/sales-invoice'))
      .rejects.toThrow('network down');
  });
});
