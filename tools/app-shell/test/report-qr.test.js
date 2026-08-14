import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import {
  buildDocumentQrText,
  computeDocumentQrDataUrl,
  registerReportHelpers,
} from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-4908: document QR codes are precomputed as plain data (header.qrDataUrl)
// before the synchronous Handlebars compile, on BOTH render paths (local HTML
// preview and jsreport PDF/XLSX). The old async per-report `qrCode` helper is
// gone — templates must never reference it again, or the render fails with
// `Missing helper: "qrCode"` on any path whose whitelist excludes it.
// These functions are a byte-identical port of schema_forge_core's copy
// (templates/reports/helpers/report-html-helpers.js) so dev and prod produce
// the same QR.

const ARTIFACTS_DIR = fileURLToPath(new URL('../../../artifacts', import.meta.url));

describe('buildDocumentQrText', () => {
  const fullHeader = {
    doc_type: 'AR Invoice',
    documentno: 'INV-1001',
    dateinvoiced: '2026-08-10T00:00:00.000Z',
    bp_name: 'ACME Corp',
    grandtotal: '1210.00',
    currency: 'EUR',
    org_taxid: 'B12345678',
    status: 'CO',
  };

  it('joins all known fields with pipes, prefixed, in canonical order', () => {
    assert.equal(
      buildDocumentQrText(fullHeader),
      'T:AR Invoice|N:INV-1001|D:2026-08-10|BP:ACME Corp|$:1210.00|C:EUR|TID:B12345678|S:CO'
    );
  });

  it('truncates dateinvoiced to the first 10 chars (date-only)', () => {
    const text = buildDocumentQrText({ dateinvoiced: '2026-08-10T15:30:00Z' });
    assert.equal(text, 'D:2026-08-10');
  });

  it('skips missing fields without leaving empty segments', () => {
    const text = buildDocumentQrText({ documentno: 'INV-2', status: 'DR' });
    assert.equal(text, 'N:INV-2|S:DR');
  });

  it('ignores unknown header fields', () => {
    assert.equal(buildDocumentQrText({ foo: 'bar', documentno: 'X' }), 'N:X');
  });

  it('returns "empty" for a header object with no known fields', () => {
    assert.equal(buildDocumentQrText({}), 'empty');
  });

  it('returns "no data" when there is no header', () => {
    assert.equal(buildDocumentQrText(null), 'no data');
    assert.equal(buildDocumentQrText(undefined), 'no data');
    assert.equal(buildDocumentQrText('not-an-object'), 'no data');
  });

  it('skips falsy field values (empty string, 0, null)', () => {
    assert.equal(
      buildDocumentQrText({ documentno: '', grandtotal: 0, currency: null, status: 'CO' }),
      'S:CO'
    );
  });
});

describe('computeDocumentQrDataUrl', () => {
  it('returns a PNG data URL for a full header', async () => {
    const url = await computeDocumentQrDataUrl({ documentno: 'INV-1001', status: 'CO' });
    assert.ok(url.startsWith('data:image/png;base64,'), `unexpected prefix: ${url.slice(0, 30)}`);
  });

  it('still returns a QR ("no data") when header is missing', async () => {
    const url = await computeDocumentQrDataUrl(null);
    assert.ok(url.startsWith('data:image/png;base64,'));
  });

  it('encodes the exact text and options via an injected qrcode module', async () => {
    const calls = [];
    const fakeQrcode = {
      toDataURL: async (text, options) => {
        calls.push({ text, options });
        return 'data:image/png;base64,FAKE';
      },
    };
    const url = await computeDocumentQrDataUrl(
      { documentno: 'INV-7', currency: 'USD' },
      { qrcode: fakeQrcode }
    );
    assert.equal(url, 'data:image/png;base64,FAKE');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, 'N:INV-7|C:USD');
    assert.deepEqual(calls[0].options, { width: 120, margin: 1 });
  });

  it('produces identical output for identical headers (deterministic)', async () => {
    const header = { documentno: 'INV-9' };
    const [a, b] = await Promise.all([
      computeDocumentQrDataUrl(header),
      computeDocumentQrDataUrl(header),
    ]);
    assert.equal(a, b);
  });
});

describe('print-* artifacts — QR is data, never a helper', () => {
  const printDirs = readdirSync(ARTIFACTS_DIR).filter((d) => d.startsWith('print-'));

  it('finds the document print artifacts', () => {
    assert.ok(printDirs.length >= 8, `expected >= 8 print-* artifacts, found ${printDirs.length}`);
  });

  it('no template.hbs references the removed {{qrCode}} helper', () => {
    for (const dir of printDirs) {
      const tpl = readFileSync(join(ARTIFACTS_DIR, dir, 'template.hbs'), 'utf8');
      assert.ok(!tpl.includes('{{qrCode'), `${dir}/template.hbs still calls the qrCode helper`);
    }
  });

  it('every template.hbs renders the QR from {{header.qrDataUrl}}', () => {
    for (const dir of printDirs) {
      const tpl = readFileSync(join(ARTIFACTS_DIR, dir, 'template.hbs'), 'utf8');
      assert.ok(tpl.includes('{{header.qrDataUrl}}'), `${dir}/template.hbs does not render header.qrDataUrl`);
    }
  });

  it("no helpers.js requires 'qrcode' or declares a qrCode helper anymore", () => {
    for (const dir of printDirs) {
      const helpersPath = join(ARTIFACTS_DIR, dir, 'helpers.js');
      if (!existsSync(helpersPath)) continue;
      const src = readFileSync(helpersPath, 'utf8');
      assert.ok(!src.includes("require('qrcode')"), `${dir}/helpers.js still requires qrcode`);
      assert.ok(!/function\s+qrCode\b/.test(src), `${dir}/helpers.js still declares a qrCode helper`);
    }
  });
});

describe('document template render (print-sales-invoice, dev HTML path)', () => {
  const templateContent = readFileSync(join(ARTIFACTS_DIR, 'print-sales-invoice', 'template.hbs'), 'utf8');
  const helpersPath = join(ARTIFACTS_DIR, 'print-sales-invoice', 'helpers.js');
  const helpersCode = existsSync(helpersPath) ? readFileSync(helpersPath, 'utf8') : '';

  const header = {
    doc_type: 'AR Invoice',
    documentno: 'INV-1001',
    dateinvoiced: '2026-08-10',
    bp_name: 'ACME Corp',
    grandtotal: '1210.00',
    currency: 'EUR',
    status: 'CO',
  };

  it('renders an inline PNG QR without registering any qrCode helper', async () => {
    const hb = Handlebars.create();
    registerReportHelpers(hb, helpersCode);
    header.qrDataUrl = await computeDocumentQrDataUrl(header);
    const html = hb.compile(templateContent)({
      css: '',
      meta: { title: 'Sales Invoice', generatedAt: new Date().toISOString(), filters: [], params: {} },
      header,
      lines: [],
      taxes: [],
    });
    assert.match(html, /src="data:image\/png;base64,/);
    assert.ok(!html.includes('Missing helper'));
  });

  it('compiling without a qrCode helper no longer throws (template does not reference it)', () => {
    const hb = Handlebars.create();
    registerReportHelpers(hb, helpersCode);
    // Handlebars throws `Missing helper: "qrCode"` at render time when a
    // template invokes an unregistered helper with an argument — the exact
    // production failure this ticket fixes.
    assert.doesNotThrow(() => {
      hb.compile(templateContent)({ css: '', meta: { filters: [] }, header: {}, lines: [], taxes: [] });
    });
  });
});
