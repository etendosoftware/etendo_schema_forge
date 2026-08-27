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
const REPORT_TEMPLATES_DIR = fileURLToPath(new URL('../../../templates/reports', import.meta.url));

function expandDocumentPartials(source) {
  const branding = readFileSync(join(REPORT_TEMPLATES_DIR, 'document-branding.hbs'), 'utf8');
  return source.replace(/\{\{>\s*document-branding\s*\}\}/g, branding);
}

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

  it('uses dateordered for orders/quotations (D: prefix, truncated)', () => {
    assert.equal(
      buildDocumentQrText({ documentno: 'SO-1', dateordered: '2026-08-01T09:00:00Z' }),
      'N:SO-1|D:2026-08-01'
    );
  });

  it('uses movementdate for shipments/receipts (no amount/currency fields)', () => {
    assert.equal(
      buildDocumentQrText({ doc_type: 'Shipment', documentno: 'SH-1', movementdate: '2026-08-02T00:00:00Z', bp_name: 'ACME', status: 'CO' }),
      'T:Shipment|N:SH-1|D:2026-08-02|BP:ACME|S:CO'
    );
  });

  it('uses paymentdate and amount for payments', () => {
    assert.equal(
      buildDocumentQrText({ documentno: 'PAY-1', paymentdate: '2026-08-03T12:00:00Z', amount: '500.00', currency: 'EUR' }),
      'N:PAY-1|D:2026-08-03|$:500.00|C:EUR'
    );
  });

  it('prefers dateinvoiced and grandtotal when multiple candidates exist', () => {
    assert.equal(
      buildDocumentQrText({ dateinvoiced: '2026-08-10', dateordered: '2026-08-01', grandtotal: '100', amount: '99' }),
      'D:2026-08-10|$:100'
    );
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
  const templateContent = expandDocumentPartials(
    readFileSync(join(ARTIFACTS_DIR, 'print-sales-invoice', 'template.hbs'), 'utf8'),
  );
  const helpersPath = join(ARTIFACTS_DIR, 'print-sales-invoice', 'helpers.js');
  const helpersCode = existsSync(helpersPath) ? readFileSync(helpersPath, 'utf8') : '';

  // ETP-4912: the invoice contract SQL emits `qr_mode` as a constant, so a real
  // print-sales-invoice header ALWAYS carries it. Tests use the same shape.
  const header = {
    doc_type: 'AR Invoice',
    documentno: 'INV-1001',
    dateinvoiced: '2026-08-10',
    bp_name: 'ACME Corp',
    grandtotal: '1210.00',
    currency: 'EUR',
    status: 'CO',
    qr_mode: 'verifactu',
    verifactu_qr_url:
      'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR' +
      '?nif=B12345678&numserie=INV-1001&fecha=10-08-2026&importe=1210.00',
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

// ---------------------------------------------------------------------------
// Verifactu mode (ETP-4912) — mirrors schema_forge_core/cli/test/report-qr.test.js
// ---------------------------------------------------------------------------

const AEAT_URL =
  'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR' +
  '?nif=A39200019&numserie=10000014&fecha=16-04-2026&importe=1355.20';

describe('buildDocumentQrText — Verifactu mode', () => {
  it('returns the AEAT URL verbatim, with query params untouched', () => {
    const text = buildDocumentQrText({ qr_mode: 'verifactu', verifactu_qr_url: AEAT_URL });
    assert.equal(text, AEAT_URL);
    assert.equal(text.split('&').length, 4);
    assert.ok(text.includes('importe=1355.20'));
  });

  it('ignores the document fields entirely when the AEAT URL is present', () => {
    const text = buildDocumentQrText({
      qr_mode: 'verifactu',
      verifactu_qr_url: AEAT_URL,
      documentno: 'INV-1001',
      grandtotal: '1210.00',
    });
    assert.equal(text, AEAT_URL);
  });

  it('returns empty (no QR) when the AEAT URL has not been issued yet', () => {
    for (const value of [null, undefined, '', '   ']) {
      assert.equal(buildDocumentQrText({ qr_mode: 'verifactu', verifactu_qr_url: value }), '');
    }
    assert.equal(buildDocumentQrText({ qr_mode: 'verifactu' }), '');
  });

  it('leaves every other printable on the internal pipe-string (regression guard)', () => {
    assert.equal(
      buildDocumentQrText({ documentno: 'SO-5', currency: 'EUR', verifactu_qr_url: AEAT_URL }),
      'N:SO-5|C:EUR'
    );
  });
});

describe('computeDocumentQrDataUrl — Verifactu mode', () => {
  it('encodes the AEAT URL at AEAT-compliant options (level M, 400px for 40mm)', async () => {
    const calls = [];
    const fakeQrcode = {
      toDataURL: async (text, options) => {
        calls.push({ text, options: { ...options } });
        return 'data:image/png;base64,FAKE';
      },
    };
    await computeDocumentQrDataUrl(
      { qr_mode: 'verifactu', verifactu_qr_url: AEAT_URL },
      { qrcode: fakeQrcode }
    );
    assert.equal(calls[0].text, AEAT_URL);
    assert.equal(calls[0].options.errorCorrectionLevel, 'M');
    assert.equal(calls[0].options.width, 400);
  });

  it('returns no data URL at all when there is nothing to encode', async () => {
    assert.equal(await computeDocumentQrDataUrl({ qr_mode: 'verifactu' }), '');
  });
});

describe('print-sales-invoice template — Verifactu QR block (ETP-4912)', () => {
  const templateContent = expandDocumentPartials(
    readFileSync(join(ARTIFACTS_DIR, 'print-sales-invoice', 'template.hbs'), 'utf8'),
  );
  const helpersPath = join(ARTIFACTS_DIR, 'print-sales-invoice', 'helpers.js');
  const helpersCode = existsSync(helpersPath) ? readFileSync(helpersPath, 'utf8') : '';

  function render(header) {
    const hb = Handlebars.create();
    registerReportHelpers(hb, helpersCode);
    return hb.compile(templateContent)({
      css: '',
      meta: { title: 'Sales Invoice', generatedAt: '2026-08-24T10:00:00.000Z', filters: [], params: {} },
      header,
      lines: [],
      taxes: [],
    });
  }

  it('renders the AEAT-mandated label and caption around the QR', async () => {
    const header = { qr_mode: 'verifactu', verifactu_qr_url: AEAT_URL, documentno: 'INV-1' };
    header.qrDataUrl = await computeDocumentQrDataUrl(header);
    const html = render(header);
    // art. 20.1.b + section 3: the label always precedes the QR, the phrase follows it.
    assert.match(html, /QR Tributario:/);
    assert.match(html, /Factura verificable en la sede electrónica de la AEAT/);
    assert.match(html, /class="verifactu-qr-img"/);
  });

  it('places the QR block before the invoice content, not in the footer', async () => {
    const header = { qr_mode: 'verifactu', verifactu_qr_url: AEAT_URL, documentno: 'INV-1' };
    header.qrDataUrl = await computeDocumentQrDataUrl(header);
    const html = render(header);
    // Section 3: the QR goes at the start of the invoice and must be its FIRST QR.
    // Compare the body markup, not the class names — those also appear in <style>.
    assert.ok(
      html.indexOf('<div class="verifactu-qr">') < html.indexOf('<div class="doc-header">'),
      'the QR block must precede the invoice header markup'
    );
    assert.equal((html.match(/data:image\/png;base64,/g) || []).length, 1);
  });

  it('renders no QR at all when the AEAT URL has not been issued', async () => {
    const header = { qr_mode: 'verifactu', documentno: 'INV-2' };
    header.qrDataUrl = await computeDocumentQrDataUrl(header);
    const html = render(header);
    assert.ok(!html.includes('data:image/png;base64,'), 'no QR image should be rendered');
    assert.ok(!html.includes('QR Tributario:'), 'no label without a QR');
    assert.ok(!html.includes('<img src="" '), 'never an empty img src');
  });

  it('no longer renders the old internal footer QR', async () => {
    const header = { qr_mode: 'verifactu', verifactu_qr_url: AEAT_URL, documentno: 'INV-3' };
    header.qrDataUrl = await computeDocumentQrDataUrl(header);
    const html = render(header);
    // A second, non-AEAT QR on a fiscal document is what the spec warns against.
    assert.ok(!html.includes('Scan to verify'));
  });
});
