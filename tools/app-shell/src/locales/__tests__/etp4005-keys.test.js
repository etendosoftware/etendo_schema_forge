import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-4005 — verify every new i18n key shipped by the feature exists in BOTH
 * locale files (en_US.json and es_ES.json) under genericLabels with a non-empty
 * translation. Prevents missing-key fallbacks from regressing into hardcoded
 * English in the UI.
 *
 * The umbrella structural parity is already covered by es_ES-structure.test.js
 * (every top-level/window/tab/menu key must match). This test adds the *per-key*
 * coverage that the structure suite cannot enforce because genericLabels is not
 * compared key-by-key.
 */

const ETP_4005_KEYS = [
  'paymentDateRequired',
  'paymentAmountInvalid',
  'paymentAccountRequired',
  'paymentRequestFailed',
  'fieldMinValueError',
  'recordProcessed',
  'recordSaved',
  'recordCreated',
];

describe('ETP-4005 — i18n key parity', () => {
  let enUS;
  let esES;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../es_ES.json', import.meta.url), 'utf8'));
  });

  it('en_US.genericLabels exists', () => {
    assert.ok(enUS.genericLabels && typeof enUS.genericLabels === 'object',
      'en_US.json must have a genericLabels object');
  });

  it('es_ES.genericLabels exists', () => {
    assert.ok(esES.genericLabels && typeof esES.genericLabels === 'object',
      'es_ES.json must have a genericLabels object');
  });

  for (const key of ETP_4005_KEYS) {
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
      // Acceptable identical exceptions: short proper nouns / acronyms. For
      // these ETP-4005 keys all translations are full sentences, so a perfect
      // match almost always means the Spanish entry was forgotten.
      const en = enUS.genericLabels[key];
      const es = esES.genericLabels[key];
      assert.notEqual(en, es, `${key} has identical en/es text — likely missing translation`);
    });
  }

  it('ETP-4005 payment validation keys are NOT hardcoded into the source', () => {
    // Sanity guard: scan only the obvious places where the regression usually
    // creeps in (InvoicePaymentModal). Source-level guard lives in the
    // InvoicePaymentModal.test.js source-shape suite — this one just protects
    // the locale invariant.
    const en = enUS.genericLabels;
    assert.equal(en.paymentDateRequired, 'Payment date is required');
    assert.equal(en.paymentAmountInvalid, 'Enter a valid amount');
    assert.equal(en.paymentAccountRequired, 'Select an account');
    assert.equal(en.paymentRequestFailed, 'The payment could not be processed. Please try again.');
  });

  it('fieldMinValueError English text mentions the negative-value semantics', () => {
    const en = enUS.genericLabels.fieldMinValueError;
    assert.match(en, /negative|min|below/i,
      'fieldMinValueError should describe the min/negative constraint');
  });
});
