import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the defaults-fetching logic in useEntity.handleNew.
 *
 * Since useEntity is a React hook, we extract and test the core fetch logic
 * in isolation without requiring React rendering infrastructure.
 */

/**
 * Simulates the defaults-fetching logic from handleNew.
 * This mirrors the implementation in useEntity.js without React dependencies.
 */
async function fetchDefaults(apiBaseUrl, entity, token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(`${apiBaseUrl}/${entity}/defaults`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.defaults) {
        return data.defaults;
      }
    }
  } catch {
    // Best-effort: return null if endpoint fails
  }
  return null;
}

describe('useEntity defaults fetching logic', () => {
  it('fetches defaults from the correct URL', async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({ defaults: { documentStatus: 'DR', salesTransaction: true } }),
      };
    };

    const result = await fetchDefaults('/sws/neo/purchase-order', 'Header', 'test-token');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/sws/neo/purchase-order/Header/defaults');
    assert.equal(calls[0].opts.headers['Authorization'], 'Bearer test-token');
    assert.deepEqual(result, { documentStatus: 'DR', salesTransaction: true });

    globalThis.fetch = originalFetch;
  });

  it('returns null when endpoint returns non-ok status', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    const result = await fetchDefaults('/sws/neo/purchase-order', 'Header', 'test-token');
    assert.equal(result, null);

    globalThis.fetch = originalFetch;
  });

  it('returns null when endpoint throws a network error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('Network error'); };

    const result = await fetchDefaults('/sws/neo/purchase-order', 'Header', 'test-token');
    assert.equal(result, null);

    globalThis.fetch = originalFetch;
  });

  it('returns null when response has no defaults property', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ message: 'No defaults configured' }),
    });

    const result = await fetchDefaults('/sws/neo/purchase-order', 'Header', 'test-token');
    assert.equal(result, null);

    globalThis.fetch = originalFetch;
  });

  it('returns defaults with all field types', async () => {
    const originalFetch = globalThis.fetch;
    const expectedDefaults = {
      documentStatus: 'DR',
      salesTransaction: true,
      warehouse: 'wh-001',
      orderDate: '2026-03-13',
      grandTotalAmount: 0,
    };
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ defaults: expectedDefaults }),
    });

    const result = await fetchDefaults('/sws/neo/purchase-order', 'Header', 'test-token');
    assert.deepEqual(result, expectedDefaults);

    globalThis.fetch = originalFetch;
  });

  // The merge itself (ETP-4741: late defaults must not overwrite what the user
  // already typed) is covered against the real hook in
  // useEntity.defaultsRace.vitest.jsx, not by simulating the spread here.
});
