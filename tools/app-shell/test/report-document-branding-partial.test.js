/**
 * ETP-5013 — templates/reports/document-branding.hbs (functional-repo copy,
 * the source of truth report-api.js's own expandReportPartials() reads).
 *
 * Generalized to serve TWO branches: `header.companyLogoDataUrl` (document
 * reports, print-*, resolved from the header SQL row) and
 * `meta.companyLogoDataUrl` (listing reports, resolved from `params.orgId`
 * — see report-api.js's fetchReportData). Before ETP-5013 this partial only
 * ever checked `header.companyLogoDataUrl`, which is why it silently
 * rendered nothing for a listing report even after gaining a company-logo
 * lookup — there is no `header` object for a listing report to read it
 * from.
 *
 * See `tools/report-server/__tests__/document-branding-partial.test.js` in
 * the core repo for the identical coverage of that repo's own manually
 * kept-in-sync copy of this same file (base.css / report-html-helpers.js
 * duplication pattern).
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const _require = createRequire(import.meta.url);

const PARTIAL = readFileSync(
  fileURLToPath(new URL('../../../templates/reports/document-branding.hbs', import.meta.url)),
  'utf8',
);

function renderPartial(data) {
  const Handlebars = _require('handlebars');
  return Handlebars.compile(PARTIAL)(data);
}

describe('templates/reports/document-branding.hbs', () => {
  it('renders the header logo when header.companyLogoDataUrl is set', () => {
    const html = renderPartial({ header: { companyLogoDataUrl: 'data:image/png;base64,HEADER', org_name: 'Acme' } });
    assert.match(html, /<img/);
    assert.match(html, /src="data:image\/png;base64,HEADER"/);
    assert.match(html, /alt="Acme"/);
    assert.match(html, /class="document-brand-logo"/);
  });

  it('falls back to the listing logo when only meta.companyLogoDataUrl is set', () => {
    const html = renderPartial({ meta: { companyLogoDataUrl: 'data:image/png;base64,LISTING', title: 'Balance Sheet' } });
    assert.match(html, /<img/);
    assert.match(html, /src="data:image\/png;base64,LISTING"/);
    assert.match(html, /alt="Balance Sheet"/);
  });

  it('prefers header.companyLogoDataUrl over meta.companyLogoDataUrl when both are present', () => {
    const html = renderPartial({
      header: { companyLogoDataUrl: 'data:image/png;base64,HEADER', org_name: 'Acme' },
      meta: { companyLogoDataUrl: 'data:image/png;base64,LISTING', title: 'Balance Sheet' },
    });
    assert.match(html, /src="data:image\/png;base64,HEADER"/);
    assert.ok(!html.includes('LISTING'), 'the listing logo must not render when the document header already has one');
  });

  it('renders no <img> at all when neither header nor meta carries a logo', () => {
    assert.ok(!renderPartial({}).includes('<img'));
    assert.ok(!renderPartial({ header: {}, meta: {} }).includes('<img'));
  });
});
