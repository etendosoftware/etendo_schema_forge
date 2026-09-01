/**
 * ETP-5013 — remove the redundant "Detail"/"Detalle" heading
 * (`<div class="region-title">{{meta.labels.detail}}</div>`) that used to sit
 * right above the Purchases/Payments and Sales/Receipts `.section-banner`
 * blocks in `tax-report/template.hbs`. It was the only report that had it —
 * the section banners themselves already say "Ventas / Cobros" / "Compras /
 * Pagos", so the extra heading was pure noise.
 *
 * The other two `.region-title` headings in the same template — "Summary by
 * Tax Category" / "Summary by Tax Rate" (`meta.labels.summaryByTaxCategory` /
 * `summaryByTaxRate`) — are untouched and must keep rendering exactly as
 * before.
 *
 * `meta.labels.detail` itself is still declared in report-contract.json (left
 * in place deliberately, same as other now-unused label keys this session) —
 * this test only asserts the template no longer renders it.
 *
 * Part 1 is a source/structure check (guards against the block being
 * reintroduced by a future template edit or a `make regen` that reuses a
 * stale template as a base). Part 2 renders the real template.hbs through
 * real Handlebars with the real helpers to prove the surrounding sections
 * still render correctly.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';
import { expandBrandingPartial } from './reportBrandingPartialHelper.js';

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/tax-report');

function readTemplateSource() {
  return readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8');
}

// ── Part 1: source/structure check ──────────────────────────────────────────

describe('tax-report/template.hbs — no redundant "Detail" heading (ETP-5013)', () => {
  it('does not reference meta.labels.detail', () => {
    const source = readTemplateSource();
    assert.doesNotMatch(source, /meta\.labels\.detail\b/);
  });

  it('does not hardcode a "Detail"/"Detalle" region-title heading', () => {
    const source = readTemplateSource();
    assert.doesNotMatch(source, /region-title">\s*Detail\b/i);
    assert.doesNotMatch(source, /region-title">\s*Detalle\b/i);
  });

  it('still declares the .region-title class (used by the two summary headings)', () => {
    const source = readTemplateSource();
    assert.match(source, /\.region-title\s*\{/);
  });

  it('still has exactly two <div class="region-title"> headings — category and rate summaries', () => {
    const source = readTemplateSource();
    const headings = [...source.matchAll(/<div class="region-title">([^<]*)<\/div>/g)].map((m) => m[1]);
    assert.deepEqual(headings, ['{{meta.labels.summaryByTaxCategory}}', '{{meta.labels.summaryByTaxRate}}']);
  });
});

// ── Part 2: real Handlebars render ──────────────────────────────────────────

const CONTRACT = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'report-contract.json'), 'utf8'));
const MOCK_DATA = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'mock-data.json'), 'utf8'));
const HELPERS_CODE = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');

function labelsFor(locale) {
  const out = {};
  for (const [key, byLocale] of Object.entries(CONTRACT.labels || {})) {
    out[key] = byLocale[locale];
  }
  return out;
}

function renderHtml({ locale = 'en_US', transactionType = 'B', showDetails = true, groupByBp = true } = {}) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, HELPERS_CODE);
  const template = hb.compile(expandBrandingPartial(readTemplateSource()));
  const meta = {
    title: 'Tax Report',
    generatedAt: '2026-08-27T00:00:00.000Z',
    ui: { total: 'Total', totals: 'Totals', printedOn: 'Printed on' },
    labels: labelsFor(locale),
    filters: [],
    showDetails,
    groupByBp,
    params: { transactionType },
  };
  return template({ css: '', meta, rows: { purchase: MOCK_DATA.purchase, sales: MOCK_DATA.sales } });
}

describe('tax-report template.hbs — real render (ETP-5013)', () => {
  it('never renders the "Detail"/"Detalle" heading, for either locale', () => {
    const en = renderHtml({ locale: 'en_US' });
    const es = renderHtml({ locale: 'es_ES' });
    assert.doesNotMatch(en, /Missing helper/);
    assert.doesNotMatch(es, /Missing helper/);
    assert.doesNotMatch(en, /region-title">Detail</);
    assert.doesNotMatch(es, /region-title">Detalle</);
  });

  it('still renders the Purchases/Payments and Sales/Receipts section banners', () => {
    const html = renderHtml({ locale: 'es_ES', transactionType: 'B' });
    assert.match(html, /<div class="section-banner">Compras \/ Pagos<\/div>/);
    assert.match(html, /<div class="section-banner">Ventas \/ Cobros<\/div>/);
  });

  it('still renders the detail tables (tax group rows) under those banners', () => {
    const html = renderHtml({ transactionType: 'B' });
    assert.match(html, /Adquisiciones IVA 16%/);
    assert.match(html, /Entregas IVA 16%/);
    assert.equal([...html.matchAll(/class="tax-group-header"/g)].length, 4);
  });

  it('still renders both summary headings ("Summary by Tax Category" and "Summary by Tax Rate") intact', () => {
    const html = renderHtml({ locale: 'en_US' });
    assert.match(html, /<div class="region-title">Summary by Tax Category<\/div>/);
    assert.match(html, /<div class="region-title">Summary by Tax Rate<\/div>/);
    // Only these two — the removed one must not have left a third
    assert.equal([...html.matchAll(/class="region-title"/g)].length, 2);
  });

  it('summary headings render translated [es_ES] and are still the only region-title occurrences', () => {
    const html = renderHtml({ locale: 'es_ES' });
    assert.match(html, /<div class="region-title">Resumen por Categoría de Impuesto<\/div>/);
    assert.match(html, /<div class="region-title">Resumen por Tasa de Impuesto<\/div>/);
    assert.equal([...html.matchAll(/class="region-title"/g)].length, 2);
  });

  it('when meta.showDetails is false, no detail table renders but the two summary headings still do', () => {
    // .section-banner is shared by the detail AND the two summary sections, so
    // it can't be used to detect "detail" specifically — .tax-group-header is
    // the row class unique to the detail table's per-tax rows.
    const html = renderHtml({ showDetails: false });
    assert.doesNotMatch(html, /class="tax-group-header"/, 'detail rows must be gated by meta.showDetails');
    assert.equal([...html.matchAll(/class="region-title"/g)].length, 2);
  });
});
