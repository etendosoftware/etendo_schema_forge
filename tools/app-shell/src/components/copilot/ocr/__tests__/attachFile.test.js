import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attachFile, blobToBase64 } from '../attachFile.js';
// ETP-4576 — this is a `node --test` file, so it cannot use the vitest-based
// `sessionContract` helpers. It drives the credential leaf directly instead:
// same single decision point, no vitest import.
import {
  setSessionCredentials,
  resetSessionCredentials,
  CREDENTIAL_MODES,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

const TEST_BEARER_TOKEN = 'tok-123';
const TEST_CSRF_TOKEN = 'csrf-abc';

/** Publishes BOTH credentials so `mode` is the only thing under test. */
function declareScheme(mode) {
  setSessionCredentials({ mode, token: TEST_BEARER_TOKEN, csrfToken: TEST_CSRF_TOKEN });
}

/**
 * Stub of the browser FileReader. node:test runs in plain Node, where
 * FileReader is not defined, so we install a tiny replacement on globalThis
 * before every test that exercises blob→base64 conversion.
 */
function installFakeFileReader() {
  globalThis.FileReader = class {
    constructor() {
      this.result = null;
      this.error = null;
      this.onload = null;
      this.onerror = null;
    }
    readAsDataURL(blob) {
      // Map { __base64: 'X' } blobs to a data URL. Lets each test assert on
      // exactly the bytes it sent in.
      const base64 = blob?.__base64 ?? '';
      this.result = `data:application/pdf;base64,${base64}`;
      queueMicrotask(() => this.onload && this.onload());
    }
  };
}

function makeFakePdf({ name = 'doc.pdf', base64 = 'JVBERi0=' } = {}) {
  return { name, type: 'application/pdf', __base64: base64 };
}

/* -------------------------------------------------------------------------- */
/* blobToBase64                                                                */
/* -------------------------------------------------------------------------- */

describe('blobToBase64', () => {
  let originalFR;
  beforeEach(() => {
    originalFR = globalThis.FileReader;
    installFakeFileReader();
  });
  afterEach(() => {
    if (originalFR === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalFR;
  });

  it('strips the data:<mime>;base64, prefix', async () => {
    const result = await blobToBase64(makeFakePdf({ base64: 'ABC123' }));
    assert.equal(result, 'ABC123');
  });

  it('resolves to null for missing blob', async () => {
    assert.equal(await blobToBase64(null), null);
    assert.equal(await blobToBase64(undefined), null);
  });
});

/* -------------------------------------------------------------------------- */
/* attachFile                                                                 */
/* -------------------------------------------------------------------------- */

describe('attachFile', () => {
  let originalFetch;
  let originalFR;
  let originalWindow;
  let lastRequest;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalFR = globalThis.FileReader;
    originalWindow = globalThis.window;
    installFakeFileReader();
    globalThis.window = { location: { pathname: '/web/com.etendoerp.go/index.html' } };
    lastRequest = null;
    declareScheme(CREDENTIAL_MODES.bearer);
    globalThis.fetch = async (url, init) => {
      lastRequest = { url: String(url), init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: 'Attachment created successfully' }),
      };
    };
  });
  afterEach(() => {
    resetSessionCredentials();
    globalThis.fetch = originalFetch;
    if (originalFR === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalFR;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  it('returns an error envelope when required params are missing', async () => {
    assert.deepEqual(await attachFile({}), { error: 'Missing required parameters' });
    assert.deepEqual(
      await attachFile({ tabId: '290', recordId: '' /* missing */, file: makeFakePdf() }),
      { error: 'Missing required parameters' },
    );
  });

  it('carries the CSRF proof and no Authorization under the cookie scheme', async () => {
    declareScheme(CREDENTIAL_MODES.cookie);
    await attachFile({
      tabId: '290',
      recordId: 'INV-1',
      file: makeFakePdf({ name: 'invoice.pdf', base64: 'PDFDATA' }),
    });
    assert.equal(lastRequest.init.credentials, 'include');
    assert.equal(lastRequest.init.headers['X-Go-CSRF'], TEST_CSRF_TOKEN);
    assert.equal(lastRequest.init.headers.Authorization, undefined);
  });

  it('POSTs base64 + AD_Tab_ID + Record_ID to the AttachFile webhook', async () => {
    const res = await attachFile({
      tabId: '290',
      recordId: 'INV-1',
      file: makeFakePdf({ name: 'invoice.pdf', base64: 'PDFDATA' }),
    });
    assert.deepEqual(res, { message: 'Attachment created successfully' });
    assert.match(lastRequest.url, /\/webhooks\/\?name=AttachFile/);
    assert.equal(lastRequest.init.method, 'POST');
    assert.equal(lastRequest.init.headers.Authorization, `Bearer ${TEST_BEARER_TOKEN}`);
    assert.equal(lastRequest.init.headers['X-Go-CSRF'], undefined);
    const body = JSON.parse(lastRequest.init.body);
    assert.deepEqual(body, {
      ADTabId: '290',
      RecordId: 'INV-1',
      FileName: 'invoice.pdf',
      FileContent: 'PDFDATA',
    });
  });

  it('uses the explicit fileName override when provided', async () => {
    await attachFile({
            tabId: '290',
      recordId: 'INV-2',
      file: makeFakePdf({ name: 'should-be-ignored.pdf' }),
      fileName: 'override.pdf',
    });
    const body = JSON.parse(lastRequest.init.body);
    assert.equal(body.FileName, 'override.pdf');
  });

  it('returns the server error payload when the response is non-2xx', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'storage_full' }),
    });
    const res = await attachFile({
      tabId: '290',
      recordId: 'INV-3',
      file: makeFakePdf(),
    });
    assert.deepEqual(res, { error: 'storage_full' });
  });

  it('returns an error envelope when fetch throws (network down)', async () => {
    globalThis.fetch = async () => { throw new Error('network'); };
    const res = await attachFile({
      tabId: '290', recordId: 'INV-4', file: makeFakePdf(),
    });
    assert.deepEqual(res, { error: 'network' });
  });
});
