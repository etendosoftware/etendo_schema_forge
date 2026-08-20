import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  listAttachments,
  fetchAttachmentBlob,
  fetchAttachmentBlobUrl,
} from '../listAttachments.js';
// ETP-4576 — the attachment helpers take no credential: they read the active
// session scheme. Imported from the `sessionCredentials` leaf, not the `./auth`
// barrel, which re-exports AuthContext.jsx and cannot load under `node --test`.
import {
  CREDENTIAL_MODES,
  setSessionCredentials,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

const TEST_BEARER = 'test-bearer';
const TEST_CSRF = 'test-csrf';

function declareBearer() {
  setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: TEST_BEARER, csrfToken: TEST_CSRF });
}

function declareCookie() {
  setSessionCredentials({ mode: CREDENTIAL_MODES.cookie, token: TEST_BEARER, csrfToken: TEST_CSRF });
}

describe('listAttachments', () => {
  let originalFetch;
  let originalWindow;
  let lastUrl;

  beforeEach(() => {
    declareBearer();
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    globalThis.window = { location: { pathname: '/web/com.etendoerp.go/index.html' } };
    lastUrl = null;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  it('returns [] when required params are missing', async () => {
    assert.deepEqual(await listAttachments({}), []);
    assert.deepEqual(await listAttachments({ tableName: 'C_Invoice' }), []);
    assert.deepEqual(await listAttachments({ recordId: 'X' }), []);
  });

  it('GETs /sws/neo/attachments/{table}/{id}', async () => {
    globalThis.fetch = async (url) => {
      lastUrl = String(url);
      return {
        ok: true,
        json: async () => ({ items: [{ id: 'A1', name: 'doc.pdf' }] }),
      };
    };
    const result = await listAttachments({
      tableName: 'C_Invoice', recordId: 'INV-1',
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'A1');
    assert.match(lastUrl, /\/sws\/neo\/attachments\/C_Invoice\/INV-1$/);
  });

  it('strips spec segment from apiBaseUrl to find the root proxy base', async () => {
    globalThis.fetch = async (url) => {
      lastUrl = String(url);
      return { ok: true, json: async () => ({ items: [] }) };
    };
    await listAttachments({
      tableName: 'C_Invoice',
      recordId: 'INV-1',
      apiBaseUrl: 'http://host/sws/neo/purchase-invoice',
    });
    assert.match(lastUrl, /^http:\/\/host\/sws\/neo\/attachments\/C_Invoice\/INV-1$/);
  });

  it('accepts items / response.data / data envelopes', async () => {
    const shapes = [
      { items: [{ id: 'A1' }] },
      { response: { data: [{ id: 'A1' }] } },
      { data: [{ id: 'A1' }] },
      [{ id: 'A1' }],
    ];
    for (const shape of shapes) {
      globalThis.fetch = async () => ({ ok: true, json: async () => shape });
      const result = await listAttachments({
        tableName: 'C_Invoice', recordId: 'INV-1',
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'A1');
    }
  });

  it('drops rows without id', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ items: [{ id: 'A1' }, { name: 'no-id.pdf' }, null] }),
    });
    const result = await listAttachments({
      tableName: 'C_Invoice', recordId: 'INV-1',
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'A1');
  });

  it('returns [] on non-2xx response', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 500, json: async () => ({ error: 'boom' }),
    });
    assert.deepEqual(
      await listAttachments({ tableName: 'C_Invoice', recordId: 'X' }),
      [],
    );
  });

  it('returns [] on fetch throw (network)', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(
      await listAttachments({ tableName: 'C_Invoice', recordId: 'X' }),
      [],
    );
  });
});

// ETP-4315 follow-up (2026-08-18) — new export used by usePdfGenerator's
// cache-gating branch to serve a marked Attachment's PDF blob directly,
// skipping jsreport regeneration entirely on a cache hit.
describe('fetchAttachmentBlob', () => {
  let originalFetch;
  let originalWindow;
  let lastUrl;
  let lastOptions;

  beforeEach(() => {
    declareBearer();
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    globalThis.window = { location: { pathname: '/web/com.etendoerp.go/index.html' } };
    lastUrl = null;
    lastOptions = null;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  it('returns null when required params are missing', async () => {
    assert.equal(await fetchAttachmentBlob({}), null);
    assert.equal(await fetchAttachmentBlob({}), null);
    assert.equal(await fetchAttachmentBlob({ attachmentId: 'A1' }), null);
  });

  it('GETs /sws/neo/attachments/file/{id} with the credential from the active scheme and returns the raw Blob on success', async () => {
    const fakeBlob = new Blob(['x'], { type: 'application/pdf' });
    globalThis.fetch = async (url, options) => {
      lastUrl = String(url);
      lastOptions = options;
      return { ok: true, blob: async () => fakeBlob };
    };
    const result = await fetchAttachmentBlob({
      attachmentId: 'A1',
      apiBaseUrl: 'http://host/sws/neo/purchase-invoice',
    });
    assert.match(lastUrl, /^http:\/\/host\/sws\/neo\/attachments\/file\/A1$/);
    assert.equal(lastOptions.headers.Authorization, `Bearer ${TEST_BEARER}`);
    assert.equal(result, fakeBlob);
  });

  it('detects the attachments base from window.location when apiBaseUrl is omitted', async () => {
    globalThis.fetch = async (url) => {
      lastUrl = String(url);
      return { ok: true, blob: async () => new Blob(['x']) };
    };
    await fetchAttachmentBlob({ attachmentId: 'A1' });
    // window.location.pathname is '/web/com.etendoerp.go/index.html' (set in beforeEach);
    // detectAttachmentsBase() takes everything before '/web/', which is '' here.
    assert.equal(lastUrl, '/sws/neo/attachments/file/A1');
  });

  it('returns null (not a throw) on a failed/non-ok response', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    assert.equal(
      await fetchAttachmentBlob({ attachmentId: 'A1' }),
      null,
    );
  });

  it('returns null on fetch throw (network error)', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(
      await fetchAttachmentBlob({ attachmentId: 'A1' }),
      null,
    );
  });
});

describe('fetchAttachmentBlobUrl', () => {
  let originalFetch;
  let originalURL;
  let originalBlob;
  let lastUrl;

  beforeEach(() => {
    declareBearer();
    originalFetch = globalThis.fetch;
    originalURL = globalThis.URL;
    originalBlob = globalThis.Blob;
    globalThis.URL = {
      createObjectURL: (blob) => `blob:fake/${blob.type || 'unknown'}`,
      revokeObjectURL: () => {},
    };
    globalThis.Blob = class FakeBlob {
      constructor(parts, opts) { this.parts = parts; this.type = opts?.type; }
    };
    lastUrl = null;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.URL = originalURL;
    globalThis.Blob = originalBlob;
  });

  it('returns null when required params are missing', async () => {
    assert.equal(await fetchAttachmentBlobUrl({}), null);
    assert.equal(await fetchAttachmentBlobUrl({}), null);
    assert.equal(await fetchAttachmentBlobUrl({ attachmentId: 'A1' }), null);
  });

  it('GETs /sws/neo/attachments/file/{id} and creates a blob URL', async () => {
    globalThis.fetch = async (url) => {
      lastUrl = String(url);
      return {
        ok: true,
        blob: async () => new globalThis.Blob(['x'], { type: 'application/pdf' }),
      };
    };
    const url = await fetchAttachmentBlobUrl({
      attachmentId: 'A1',
      apiBaseUrl: 'http://host/sws/neo/purchase-invoice',
    });
    assert.match(lastUrl, /\/sws\/neo\/attachments\/file\/A1$/);
    assert.equal(url, 'blob:fake/application/pdf');
  });

  it('returns null on non-2xx response', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    assert.equal(
      await fetchAttachmentBlobUrl({ attachmentId: 'A1' }),
      null,
    );
  });

  it('returns null on fetch throw', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(
      await fetchAttachmentBlobUrl({ attachmentId: 'A1' }),
      null,
    );
  });

  // ETP-4315 follow-up (2026-08-18) — fetchAttachmentBlobUrl was refactored to
  // delegate to fetchAttachmentBlob then wrap the result in URL.createObjectURL,
  // instead of duplicating the fetch/URL-building logic. Assert both functions
  // hit the exact same endpoint for the same inputs (same delegation target),
  // and that a null Blob from the shared code path still yields null here too.
  it('hits the same endpoint as fetchAttachmentBlob for the same inputs (post-refactor delegation)', async () => {
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      return { ok: true, blob: async () => new globalThis.Blob(['x'], { type: 'application/pdf' }) };
    };
    const params = { attachmentId: 'A9', apiBaseUrl: 'http://host/sws/neo/sales-order' };
    await fetchAttachmentBlob(params);
    await fetchAttachmentBlobUrl(params);
    assert.equal(urls.length, 2);
    assert.equal(urls[0], urls[1]);
  });
});
