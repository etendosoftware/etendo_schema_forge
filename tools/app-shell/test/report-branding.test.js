import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hydrateDocumentBranding } from '../vite-plugins/report-branding.js';

function response({ ok = true, contentType = 'image/png', bytes = [1, 2, 3] } = {}) {
  return {
    ok,
    headers: { get: (name) => name === 'content-type' ? contentType : null },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

describe('document report branding', () => {
  it('embeds the organization image returned by the authenticated NEO endpoint', async () => {
    const result = await hydrateDocumentBranding(
      { org_name: 'Acme', org_logo_id: 'img-1' },
      {
        authToken: 'token',
        etendoBase: 'http://etendo.test/etendo',
        fetchImpl: async (url, options) => {
          assert.equal(url, 'http://etendo.test/etendo/sws/neo/image/img-1');
          assert.equal(options.headers.Authorization, 'Bearer token');
          return response({ contentType: 'image/svg+xml', bytes: [60, 115, 118, 103, 62] });
        },
      },
    );

    assert.equal(result.companyLogoDataUrl, 'data:image/svg+xml;base64,PHN2Zz4=');
  });

  it('keeps the report printable when branding is unavailable', async () => {
    const header = { org_name: 'Acme', org_logo_id: 'missing' };
    const result = await hydrateDocumentBranding(header, {
      authToken: 'token',
      fetchImpl: async () => response({ ok: false }),
    });
    assert.deepEqual(result, header);
  });
});
