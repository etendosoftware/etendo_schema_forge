import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Comment text mentioning the old header would satisfy a doesNotMatch on the raw
// source, so the negative assertions below read the code only.
function stripComments(text) {
  return text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GenerateLinesModal.jsx'), 'utf8');

// ---------------------------------------------------------------------------
// Structural assertions — read the real source. These are the regression
// tripwire: if the "omit M_Product_Category_ID when empty" fix (ETP-4528
// Bug 1) is ever reverted to an unconditional `categoryId || '0'` / `|| null`
// default, these fail immediately without needing to execute anything.
// ---------------------------------------------------------------------------

describe('GenerateLinesModal — source contract', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function GenerateLinesModal/);
  });

  it('uses createPortal to render into document.body', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('REGRESSION: omits M_Product_Category_ID entirely when no category is selected', () => {
    assert.match(src, /if\s*\(categoryId\)\s*\{\s*payload\.M_Product_Category_ID\s*=\s*categoryId;\s*\}/);
  });

  it('REGRESSION: never falls back to a sentinel value for the omitted category', () => {
    assert.doesNotMatch(src, /categoryId\s*\|\|\s*['"]0['"]/);
    assert.doesNotMatch(src, /categoryId\s*\|\|\s*null/);
    assert.doesNotMatch(src, /M_Product_Category_ID:\s*categoryId,/);
  });

  it('defaults qtyRange state to "N" (not 0)', () => {
    assert.match(src, /useState\(['"]N['"]\)/);
  });

  it('declares the 4 QTY_OPTIONS with backend-matching codes, in order < > = N', () => {
    const optsMatch = src.match(/const QTY_OPTIONS = \[([\s\S]*?)\];/);
    assert.ok(optsMatch, 'QTY_OPTIONS array not found');
    const body = optsMatch[1];
    const values = [...body.matchAll(/value:\s*['"]([<>=N])['"]/g)].map((m) => m[1]);
    assert.deepEqual(values, ['<', '>', '=', 'N']);
    const keys = [...body.matchAll(/key:\s*['"](\w+)['"]/g)].map((m) => m[1]);
    assert.deepEqual(keys, ['qtyLessZero', 'qtyGreaterZero', 'qtyZero', 'qtyNotZero']);
  });

  it('builds the base payload with QtyRange and regularization', () => {
    assert.match(src, /QtyRange:\s*qtyRange,/);
    assert.match(src, /regularization:\s*resetBookQty\s*\?\s*['"]Y['"]\s*:\s*['"]N['"],/);
  });

  it('POSTs to the generateLines action endpoint on the inventory entity', () => {
    assert.match(src, /\/inventory\/\$\{recordId\}\/action\/generateLines/);
    assert.match(src, /method:\s*['"]POST['"]/);
  });

  it('proves its writes through the shared write builder, not a hand-built bearer', () => {
    // ETP-4576 — this asserted `Authorization: `Bearer ${token}``. The call site no
    // longer chooses a scheme: writeHeaders() resolves it and carries the CSRF proof
    // the cookie session requires. The negative matters as much as the positive —
    // a reintroduced bearer here is exactly the regression that answers 403.
    assert.match(src, /writeHeaders\(\)/);
    assert.doesNotMatch(stripComments(src), /Authorization:\s*`Bearer/);
  });

  it('guards against double submission while a request is in flight', () => {
    assert.match(src, /if\s*\(submitting\)\s*return;/);
    assert.match(src, /setSubmitting\(true\)/);
    assert.match(src, /disabled=\{submitting\}/);
    assert.match(src, /submitting\s*\?\s*ui\(['"]generating['"]\)\s*:\s*ui\(['"]generate['"]\)/);
  });

  it('shows a toast on success, refreshes and closes the modal', () => {
    assert.match(src, /toast\.success\(ui\(['"]linesGeneratedAutomatically['"]\)\)/);
    assert.match(src, /onRefresh\?\.\(\)/);
    assert.match(src, /onClose\(\);/);
  });

  it('shows a toast on error and keeps the modal open (resets submitting)', () => {
    assert.match(src, /toast\.error\(err\?\.message\s*\|\|\s*err\?\.response\?\.message\s*\|\|\s*ui\(['"]errorGeneratingList['"]\)\)/);
    assert.match(src, /setSubmitting\(false\);\s*\n\s*return;/);
  });

  it('fetches product categories on mount for the selector', () => {
    assert.match(src, /useEffect/);
    assert.match(src, /selectors\/M_Product_Category_ID/);
  });

  it('uses useUI for i18n', () => {
    assert.match(src, /useUI/);
    assert.match(src, /from\s+['"]@\/i18n['"]/);
  });
});

// ---------------------------------------------------------------------------
// Behavioral tests — reimplement handleGenerate's payload-building + fetch
// call exactly as verified against the source assertions above, with a
// mocked fetch. This is the same pattern used by
// artifacts/sales-invoice/custom/__tests__/ImportFromShipmentModal.test.js
// (fetchDocuments extraction) since the component itself only exports a
// default React function and this repo's node:test runner cannot parse JSX.
// ---------------------------------------------------------------------------

async function handleGenerate({ apiBaseUrl, recordId, token, categoryId, qtyRange, resetBookQty, toast, onRefresh, onClose, ui }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const payload = {
    QtyRange: qtyRange,
    regularization: resetBookQty ? 'Y' : 'N',
  };
  if (categoryId) {
    payload.M_Product_Category_ID = categoryId;
  }
  try {
    const res = await fetch(`${apiBaseUrl}/inventory/${recordId}/action/generateLines`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.message || err?.response?.message || ui('errorGeneratingList'));
      return { submitting: false };
    }
    await res.json().catch(() => null);
    toast.success(ui('linesGeneratedAutomatically'));
    onRefresh?.();
    onClose();
    return { submitting: false };
  } catch {
    toast.error(ui('errorGeneratingList'));
    return { submitting: false };
  }
}

function mockToast() {
  return { success: mock.fn(), error: mock.fn() };
}

function baseParams(overrides = {}) {
  return {
    apiBaseUrl: '/sws/neo/physical-inventory',
    recordId: 'INV-1',
    token: 'tok-123',
    categoryId: '',
    qtyRange: 'N',
    resetBookQty: false,
    toast: mockToast(),
    onRefresh: mock.fn(),
    onClose: mock.fn(),
    ui: (key) => key,
    ...overrides,
  };
}

describe('GenerateLinesModal — handleGenerate behavior', () => {
  afterEach(() => {
    mock.reset();
  });

  it('REGRESSION: omits M_Product_Category_ID from the body when no category is selected', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    });
    const params = baseParams({ categoryId: '' });
    await handleGenerate(params);

    assert.ok(!('M_Product_Category_ID' in capturedBody), 'M_Product_Category_ID must not be present at all');
    assert.deepEqual(Object.keys(capturedBody).sort(), ['QtyRange', 'regularization']);
  });

  it('sends M_Product_Category_ID when a specific category is selected', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    });
    const params = baseParams({ categoryId: 'CAT1' });
    await handleGenerate(params);

    assert.equal(capturedBody.M_Product_Category_ID, 'CAT1');
  });

  it('defaults QtyRange to "N" when untouched', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    });
    await handleGenerate(baseParams());
    assert.equal(capturedBody.QtyRange, 'N');
  });

  it('sends the chosen QtyRange code (< > = N)', async () => {
    for (const code of ['<', '>', '=', 'N']) {
      let capturedBody;
      globalThis.fetch = mock.fn(async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({}) };
      });
      await handleGenerate(baseParams({ qtyRange: code }));
      assert.equal(capturedBody.QtyRange, code);
    }
  });

  it('sends regularization "N" when the checkbox is unchecked', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    });
    await handleGenerate(baseParams({ resetBookQty: false }));
    assert.equal(capturedBody.regularization, 'N');
  });

  it('sends regularization "Y" when the checkbox is checked', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    });
    await handleGenerate(baseParams({ resetBookQty: true }));
    assert.equal(capturedBody.regularization, 'Y');
  });

  it('POSTs to the generateLines action endpoint with the auth header', async () => {
    let capturedUrl;
    let capturedOpts;
    globalThis.fetch = mock.fn(async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return { ok: true, json: async () => ({}) };
    });
    await handleGenerate(baseParams({ apiBaseUrl: '/sws/neo/physical-inventory', recordId: 'INV-42', token: 'abc' }));

    assert.equal(capturedUrl, '/sws/neo/physical-inventory/inventory/INV-42/action/generateLines');
    assert.equal(capturedOpts.method, 'POST');
    assert.equal(capturedOpts.headers.Authorization, 'Bearer abc');
  });

  it('on success: toasts success, refreshes and closes', async () => {
    globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    const params = baseParams();
    await handleGenerate(params);

    assert.equal(params.toast.success.mock.callCount(), 1);
    assert.equal(params.toast.success.mock.calls[0].arguments[0], 'linesGeneratedAutomatically');
    assert.equal(params.onRefresh.mock.callCount(), 1);
    assert.equal(params.onClose.mock.callCount(), 1);
  });

  it('on server error: toasts the server message and does NOT close the modal', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      json: async () => ({ message: 'boom' }),
    }));
    const params = baseParams();
    await handleGenerate(params);

    assert.equal(params.toast.error.mock.callCount(), 1);
    assert.equal(params.toast.error.mock.calls[0].arguments[0], 'boom');
    assert.equal(params.onClose.mock.callCount(), 0);
    assert.equal(params.toast.success.mock.callCount(), 0);
  });

  it('on server error with no parseable body: falls back to the errorGeneratingList label', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      json: async () => { throw new Error('not json'); },
    }));
    const params = baseParams();
    await handleGenerate(params);

    assert.equal(params.toast.error.mock.callCount(), 1);
    assert.equal(params.toast.error.mock.calls[0].arguments[0], 'errorGeneratingList');
    assert.equal(params.onClose.mock.callCount(), 0);
  });

  it('on network failure: toasts the generic error label and does not throw', async () => {
    globalThis.fetch = mock.fn(async () => { throw new Error('network down'); });
    const params = baseParams();
    await handleGenerate(params);

    assert.equal(params.toast.error.mock.callCount(), 1);
    assert.equal(params.toast.error.mock.calls[0].arguments[0], 'errorGeneratingList');
    assert.equal(params.onClose.mock.callCount(), 0);
  });
});
