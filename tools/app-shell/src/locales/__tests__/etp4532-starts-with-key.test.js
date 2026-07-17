import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-4532 — verify the new "starts with" advanced-filter operator label key
 * (opStartsWith) exists in BOTH locale files under genericLabels, alongside the
 * sibling operator keys it was added next to (opContains / opNotContains).
 *
 * The AdvancedFilterBuilder maps the internal operator `iStartsWith` to the i18n
 * key `opStartsWith` (OP_LABEL_KEY). A missing key in either locale would render
 * the raw key in the operator dropdown instead of a translated label.
 */

const OP_KEYS = ['opStartsWith'];
// Sanity: the sibling keys must also exist so the new one is not orphaned.
const SIBLING_KEYS = ['opContains', 'opNotContains'];

describe('ETP-4532 — starts-with operator i18n key parity', () => {
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

  for (const key of [...OP_KEYS, ...SIBLING_KEYS]) {
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
  }

  it('opStartsWith — Spanish and English translations differ (no copy-paste regression)', () => {
    assert.notEqual(enUS.genericLabels.opStartsWith, esES.genericLabels.opStartsWith,
      'opStartsWith has identical en/es text — likely missing translation');
  });

  it('opStartsWith — expected literal translations', () => {
    assert.equal(enUS.genericLabels.opStartsWith, 'Starts with');
    assert.equal(esES.genericLabels.opStartsWith, 'Empieza por');
  });
});
