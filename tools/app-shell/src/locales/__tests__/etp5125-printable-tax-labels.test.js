import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5125 — the commercial printable (DOCUMENT_TEMPLATE, shared by Sales
 * Quotation / Sales Order / Sales Invoice / Purchase Order) must use GENERIC
 * tax wording, and must name the document's currency in its header.
 *
 * Two defects, one root: three genericLabels keys hardcoded to "IVA".
 *
 *   - `invoicePdfColTax` labels the lines-table column whose CELL prints the
 *     tax NAME (`tax$_identifier`, e.g. "IVA 21%") — not a percentage. So the
 *     header must read "Impuesto", never "IVA%".
 *   - `invoicePdfTax` / `invoicePdfSubtotal` label the Totals rows, and the
 *     on-screen totals panel (DocumentTotalsPanel.jsx -> ui('tax')) already
 *     says "Impuesto" — the PDF contradicted the screen.
 *
 * These three keys are consumed EXCLUSIVELY by buildDocumentPdfLabels() in
 * windows/custom/shared/documentPdf.js, so their values are the whole fix for
 * all four documents across all five entry points (preview, download, both
 * email paths, print).
 *
 * `invoicePdfCurrency` is the new key for CP-2 (the currency in the header).
 *
 * Only the three top-level locale files are asserted: `locales/generated/
 * core.*.json` are gitignored build output regenerated from these by
 * vite-plugins/slice-labels.js.
 */

const COL_TAX_ES = 'Impuesto';
const TAX_ES = 'Impuestos';
const SUBTOTAL_ES = 'Subtotal (sin impuestos)';
const CURRENCY_ES = 'Moneda:';

const COL_TAX_KEY = 'invoicePdfColTax';
const TAX_KEY = 'invoicePdfTax';
const SUBTOTAL_KEY = 'invoicePdfSubtotal';
const CURRENCY_KEY = 'invoicePdfCurrency';

/** The keys whose value must never mention a single concrete tax again. */
const TAX_WORDING_KEYS = [COL_TAX_KEY, TAX_KEY, SUBTOTAL_KEY];

function loadLocale(name) {
  return JSON.parse(readFileSync(new URL(`../${name}.json`, import.meta.url), 'utf8'));
}

describe('ETP-5125 — printable tax labels are generic, not "IVA"', () => {
  let esES;
  let esAR;
  let enUS;

  before(() => {
    esES = loadLocale('es_ES');
    esAR = loadLocale('es_AR');
    enUS = loadLocale('en_US');
  });

  it('es_ES uses "Impuesto" for the lines-table tax column (CP-1)', () => {
    assert.equal(esES.genericLabels[COL_TAX_KEY], COL_TAX_ES);
  });

  it('es_ES uses "Impuestos" / "Subtotal (sin impuestos)" in the Totals rows', () => {
    assert.equal(esES.genericLabels[TAX_KEY], TAX_ES);
    assert.equal(esES.genericLabels[SUBTOTAL_KEY], SUBTOTAL_ES);
  });

  it('es_AR mirrors es_ES for the three tax labels', () => {
    assert.equal(esAR.genericLabels[COL_TAX_KEY], COL_TAX_ES);
    assert.equal(esAR.genericLabels[TAX_KEY], TAX_ES);
    assert.equal(esAR.genericLabels[SUBTOTAL_KEY], SUBTOTAL_ES);
  });

  it('en_US drops the stray "%" and pluralizes the totals wording', () => {
    assert.equal(enUS.genericLabels[COL_TAX_KEY], 'Tax');
    assert.equal(enUS.genericLabels[TAX_KEY], 'Taxes');
    assert.equal(enUS.genericLabels[SUBTOTAL_KEY], 'Subtotal (excl. taxes)');
  });

  it('never regresses to "IVA" in either Spanish locale', () => {
    for (const key of TAX_WORDING_KEYS) {
      assert.doesNotMatch(esES.genericLabels[key], /IVA/, `es_ES.${key}`);
      assert.doesNotMatch(esAR.genericLabels[key], /IVA/, `es_AR.${key}`);
    }
  });

  it('never regresses to a "%" suffix on the tax column header', () => {
    for (const locale of [esES, esAR, enUS]) {
      assert.doesNotMatch(locale.genericLabels[COL_TAX_KEY], /%/);
    }
  });
});

describe('ETP-5125 — invoicePdfCurrency exists in every locale (CP-2)', () => {
  let esES;
  let esAR;
  let enUS;

  before(() => {
    esES = loadLocale('es_ES');
    esAR = loadLocale('es_AR');
    enUS = loadLocale('en_US');
  });

  it('es_ES and es_AR read "Moneda:"', () => {
    assert.equal(esES.genericLabels[CURRENCY_KEY], CURRENCY_ES);
    assert.equal(esAR.genericLabels[CURRENCY_KEY], CURRENCY_ES);
  });

  it('en_US reads "Currency:"', () => {
    assert.equal(enUS.genericLabels[CURRENCY_KEY], 'Currency:');
  });

  // A missing key makes ui() echo the raw key into the PDF header, which is
  // indistinguishable from a genuinely untranslated string at the call site.
  it('is a non-empty string in all three locales', () => {
    for (const locale of [esES, esAR, enUS]) {
      assert.equal(typeof locale.genericLabels[CURRENCY_KEY], 'string');
      assert.ok(locale.genericLabels[CURRENCY_KEY].length > 0);
    }
  });
});
