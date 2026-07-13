import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-4029 — verify every new i18n key shipped by the "Importar desde X" currency
 * filter fix exists in BOTH locale files (en_US.json and es_ES.json) under
 * genericLabels with a non-empty translation. These keys back the empty-state
 * message shown in ImportLinesModal when all candidate documents were excluded
 * because their currency doesn't match the invoice's currency.
 *
 * The umbrella structural parity is already covered by es_ES-structure.test.js
 * (every top-level/window/tab/menu key must match). This test adds the *per-key*
 * coverage that the structure suite cannot enforce because genericLabels is not
 * compared key-by-key (see etp4005-keys.test.js for the established pattern).
 */

const ETP_4029_KEYS = [
  'noSalesOrdersMatchCurrency',
  'noPurchaseOrdersMatchCurrency',
  'noShipmentsMatchCurrency',
  'noReturnShipmentsMatchCurrency',
  'noGoodsReceiptsMatchCurrency',
];

describe('ETP-4029 — currency-filter i18n key parity', () => {
  let enUS;
  let esES;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../../locales/en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../../locales/es_ES.json', import.meta.url), 'utf8'));
  });

  it('en_US.genericLabels exists', () => {
    assert.ok(enUS.genericLabels && typeof enUS.genericLabels === 'object',
      'en_US.json must have a genericLabels object');
  });

  it('es_ES.genericLabels exists', () => {
    assert.ok(esES.genericLabels && typeof esES.genericLabels === 'object',
      'es_ES.json must have a genericLabels object');
  });

  for (const key of ETP_4029_KEYS) {
    it(`${key} — present in en_US.genericLabels with a non-empty string`, () => {
      const val = enUS.genericLabels[key];
      assert.equal(typeof val, 'string', `en_US.genericLabels.${key} must be a string`);
      assert.ok(val.trim().length > 0, `en_US.genericLabels.${key} must be non-empty`);
    });

    it(`${key} — present in es_ES.genericLabels with a non-empty string`, () => {
      const val = esES.genericLabels[key];
      assert.equal(typeof val, 'string', `es_ES.genericLabels.${key} must be a string`);
      assert.ok(val.trim().length > 0, `es_ES.genericLabels.${key} must be non-empty`);
    });

    it(`${key} — Spanish and English translations differ (no copy-paste regression)`, () => {
      const en = enUS.genericLabels[key];
      const es = esES.genericLabels[key];
      assert.notEqual(en, es, `${key} has identical en/es text — likely missing translation`);
    });

    it(`${key} — mentions currency in both locales (semantic sanity check)`, () => {
      const en = enUS.genericLabels[key];
      const es = esES.genericLabels[key];
      assert.match(en, /currency/i, `${key} en_US text should reference currency`);
      assert.match(es, /moneda/i, `${key} es_ES text should reference moneda`);
    });
  }
});
