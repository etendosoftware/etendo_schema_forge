/**
 * ETP-5013 — `hydrateDocumentBranding` moved out of this repo's Vite dev
 * plugin (`tools/app-shell/vite-plugins/report-branding.js`, now deleted)
 * into the shared package (`@etendosoftware/schema-forge-cli/src/report-branding.js`,
 * sourced from `schema_forge_core/cli/src/report-branding.js`). This test
 * only proves this repo actually consumes the SHARED module — `report-api.js`
 * imports the same package path below — and keeps a thin smoke check on the
 * two happy/unhappy paths. The exhaustive behavioral suite for the function
 * itself lives in the core repo's `cli/test/report-branding.test.js`; do not
 * duplicate it here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hydrateDocumentBranding } from '@etendosoftware/schema-forge-cli/src/report-branding.js';

const REPORT_API_SRC = readFileSync(
  fileURLToPath(new URL('../vite-plugins/report-api.js', import.meta.url)),
  'utf8',
);

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

describe('report-api.js source — consumes the shared module, never a local copy', () => {
  it('imports hydrateDocumentBranding (alongside resolveCompanyLogoDataUrl) from the published package', () => {
    // ETP-5013 follow-up added resolveCompanyLogoDataUrl to the same import —
    // see report-api-branding-org-lookup.test.js for the dedicated coverage
    // of that addition; this assertion just needs to keep matching reality.
    assert.match(
      REPORT_API_SRC,
      /import \{ hydrateDocumentBranding, resolveCompanyLogoDataUrl \} from '@etendosoftware\/schema-forge-cli\/src\/report-branding\.js'/,
    );
  });

  it('never redefines hydrateDocumentBranding locally (that was the ETP-4998 gap)', () => {
    assert.doesNotMatch(REPORT_API_SRC, /^\s*(async\s+)?function hydrateDocumentBranding/m);
  });
});
