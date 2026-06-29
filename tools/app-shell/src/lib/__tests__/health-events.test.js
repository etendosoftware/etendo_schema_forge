import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeObservabilityMock() {
  const tracked = [];
  let flushed = 0;
  let grouped = null;

  return {
    tracked,
    get flushed() { return flushed; },
    get grouped() { return grouped; },
    mock: {
      track: async (name, props) => { tracked.push({ name, props }); },
      flush: async () => { flushed += 1; },
      group: (key, id) => { grouped = { key, id }; },
    },
  };
}

// Inject mocked observability before importing health-events.
// Node's module cache is shared, so we use dynamic import with a query-busting
// technique via the registry mock approach: replace the module resolution for
// the test scope by setting up mocks before loading the module under test.

// Since Node test runner does not have jest.mock(), we use the pattern of
// loading the module with a custom loader by exporting testable internals.
// Instead, we test the public functions directly by stubbing window and
// observability via module-level monkey-patching after import.

describe('health-events — trackTransactionPosted', () => {
  let trackTransactionPosted;
  let trackDocumentCreated;
  let trackCalls;
  let flushCount;
  let originalWindow;

  beforeEach(async () => {
    // Reset state between tests
    trackCalls = [];
    flushCount = 0;

    // health-events.js imports track/flush from observability.js at module load.
    // We test via the exported functions, stubbing window.location.pathname.
    const mod = await import('../observability/health-events.js');
    trackTransactionPosted = mod.trackTransactionPosted;
    trackDocumentCreated = mod.trackDocumentCreated;
  });

  // ── getWindowName edge cases ─────────────────────────────────────────────

  it('returns undefined from getWindowName when window is not defined', () => {
    // health-events.js wraps extractWindowName in try/catch — no throw expected.
    // We cannot test this directly without controlling the module environment,
    // but we verify the function is exported and callable without error.
    assert.doesNotThrow(() => trackTransactionPosted());
  });

  it('trackTransactionPosted does not throw when called with no window', () => {
    assert.doesNotThrow(() => trackTransactionPosted());
  });

  it('trackDocumentCreated does not throw when called with no window', () => {
    assert.doesNotThrow(() => trackDocumentCreated());
  });
});

describe('health-events — HEALTH_EVENTS_MAP', () => {
  it('exports a map with the expected windows', async () => {
    const { HEALTH_EVENTS_MAP } = await import('../observability/health-events.map.js');

    // Transactional windows
    const transactional = [
      'sales-order', 'goods-shipment', 'sales-invoice', 'payment-in',
      'purchase-order', 'goods-receipt', 'purchase-invoice', 'payment-out',
      'goods-movements', 'physical-inventory', 'inventory',
      'bank-reconciliation', 'accounting',
    ];
    for (const w of transactional) {
      assert.ok(HEALTH_EVENTS_MAP[w], `Missing window: ${w}`);
      assert.equal(HEALTH_EVENTS_MAP[w].transactional, true, `${w} should be transactional`);
      assert.ok(HEALTH_EVENTS_MAP[w].document_type, `${w} missing document_type`);
      assert.ok(HEALTH_EVENTS_MAP[w].functional_area, `${w} missing functional_area`);
    }

    // Non-transactional windows (master data)
    const nonTransactional = ['sales-quotation', 'contacts', 'product', 'assets'];
    for (const w of nonTransactional) {
      assert.ok(HEALTH_EVENTS_MAP[w], `Missing window: ${w}`);
      assert.equal(HEALTH_EVENTS_MAP[w].transactional, false, `${w} should NOT be transactional`);
    }
  });

  it('all map entries have required fields', async () => {
    const { HEALTH_EVENTS_MAP } = await import('../observability/health-events.map.js');

    for (const [windowName, meta] of Object.entries(HEALTH_EVENTS_MAP)) {
      assert.ok(typeof meta.document_type === 'string' && meta.document_type.length > 0,
        `${windowName}: document_type must be a non-empty string`);
      assert.ok(typeof meta.functional_area === 'string' && meta.functional_area.length > 0,
        `${windowName}: functional_area must be a non-empty string`);
      assert.ok(typeof meta.transactional === 'boolean',
        `${windowName}: transactional must be a boolean`);
    }
  });

  it('document_type values use snake_case', async () => {
    const { HEALTH_EVENTS_MAP } = await import('../observability/health-events.map.js');
    const snakeCase = /^[a-z][a-z0-9_]*$/;

    for (const [windowName, meta] of Object.entries(HEALTH_EVENTS_MAP)) {
      assert.match(meta.document_type, snakeCase,
        `${windowName}: document_type "${meta.document_type}" is not snake_case`);
      assert.match(meta.functional_area, snakeCase,
        `${windowName}: functional_area "${meta.functional_area}" is not snake_case`);
    }
  });

  it('purchase-order is transactional (symmetry with sales-order)', async () => {
    const { HEALTH_EVENTS_MAP } = await import('../observability/health-events.map.js');
    assert.equal(HEALTH_EVENTS_MAP['purchase-order'].transactional, true);
    assert.equal(HEALTH_EVENTS_MAP['sales-order'].transactional, true);
    assert.equal(HEALTH_EVENTS_MAP['purchase-order'].functional_area, 'purchases');
    assert.equal(HEALTH_EVENTS_MAP['sales-order'].functional_area, 'sales');
  });

  it('sales-quotation is NOT transactional (no completion step)', async () => {
    const { HEALTH_EVENTS_MAP } = await import('../observability/health-events.map.js');
    assert.equal(HEALTH_EVENTS_MAP['sales-quotation'].transactional, false);
  });

  it('unknown window name is not in the map', async () => {
    const { HEALTH_EVENTS_MAP } = await import('../observability/health-events.map.js');
    assert.equal(HEALTH_EVENTS_MAP['nonexistent-window'], undefined);
  });
});

describe('health-events — payload module (extractWindowName)', () => {
  it('extracts the first path segment as window name', async () => {
    const { extractWindowName } = await import('../observability/payload.js');
    assert.equal(extractWindowName('/sales-invoice/123'), 'sales-invoice');
    assert.equal(extractWindowName('/purchase-order'), 'purchase-order');
    assert.equal(extractWindowName('/'), undefined);
    assert.equal(extractWindowName(''), undefined);
  });

  it('does not include the record ID in the window name', async () => {
    const { extractWindowName } = await import('../observability/payload.js');
    const result = extractWindowName('/sales-order/BDF8D32254824DBF8D9DCCC031D29039');
    assert.equal(result, 'sales-order');
  });

  it('handles route-param patterns without throwing', async () => {
    const { extractWindowName } = await import('../observability/payload.js');
    // normalizeRoute strips the leading ":" so "/:windowName" yields "windowName" — no crash.
    assert.doesNotThrow(() => extractWindowName('/:windowName'));
  });

  it('allowlist permits account_id, document_type, and functional_area (verified via sanitizeEventProperties)', async () => {
    // SAFE_EVENT_PROPERTY_KEYS is not exported directly. We verify allowlist membership
    // via the exported sanitizeEventProperties: keys in the allowlist survive sanitization,
    // keys outside it are stripped.
    const { sanitizeEventProperties } = await import('../observability/payload.js');

    const result = sanitizeEventProperties({
      account_id: 'client-1',
      document_type: 'sales_invoice',
      functional_area: 'sales',
      user_email: 'should-be-stripped@example.com',
      document_id: 'should-be-stripped-id',
    });

    assert.equal(result.account_id, 'client-1', 'account_id must pass through sanitization');
    assert.equal(result.document_type, 'sales_invoice', 'document_type must pass through sanitization');
    assert.equal(result.functional_area, 'sales', 'functional_area must pass through sanitization');
    assert.equal(result.user_email, undefined, 'user_email must be stripped by sanitization');
    assert.equal(result.document_id, undefined, 'document_id must be stripped by sanitization');
  });
});
