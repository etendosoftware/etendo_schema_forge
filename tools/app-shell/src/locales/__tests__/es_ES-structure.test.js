import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('es_ES.json structural integrity', () => {
  let esES;
  let enUS;

  before(() => {
    const esUrl = new URL('../es_ES.json', import.meta.url);
    const enUrl = new URL('../en_US.json', import.meta.url);
    esES = JSON.parse(readFileSync(esUrl, 'utf8'));
    enUS = JSON.parse(readFileSync(enUrl, 'utf8'));
  });

  it('has the same top-level keys as en_US.json', () => {
    const enKeys = Object.keys(enUS).sort();
    const esKeys = Object.keys(esES).sort();
    assert.deepStrictEqual(esKeys.filter(k => enKeys.includes(k)), enKeys,
      'es_ES must contain all top-level keys from en_US');
  });

  it('every en_US field key exists in es_ES fields', () => {
    const enFieldKeys = Object.keys(enUS.fields);
    const esFieldKeys = new Set(Object.keys(esES.fields));
    const missing = enFieldKeys.filter(k => !esFieldKeys.has(k));
    assert.equal(missing.length, 0,
      `Fields present in en_US but missing in es_ES: ${missing.slice(0, 10).join(', ')}`);
  });

  it('every en_US window key exists in es_ES windows', () => {
    const enKeys = Object.keys(enUS.windows);
    const esKeys = new Set(Object.keys(esES.windows));
    const missing = enKeys.filter(k => !esKeys.has(k));
    assert.equal(missing.length, 0,
      `Windows present in en_US but missing in es_ES: ${missing.slice(0, 10).join(', ')}`);
  });

  it('every en_US tab key exists in es_ES tabs', () => {
    const enKeys = Object.keys(enUS.tabs);
    const esKeys = new Set(Object.keys(esES.tabs));
    const missing = enKeys.filter(k => !esKeys.has(k));
    assert.equal(missing.length, 0,
      `Tabs present in en_US but missing in es_ES: ${missing.slice(0, 10).join(', ')}`);
  });

  it('every en_US menu key exists in es_ES menus', () => {
    const enKeys = Object.keys(enUS.menus);
    const esKeys = new Set(Object.keys(esES.menus));
    const missing = enKeys.filter(k => !esKeys.has(k));
    assert.equal(missing.length, 0,
      `Menus present in en_US but missing in es_ES: ${missing.slice(0, 10).join(', ')}`);
  });

  it('all es_ES field entries have a label property', () => {
    const badKeys = [];
    for (const [key, val] of Object.entries(esES.fields)) {
      if (typeof val !== 'object' || val === null || !('label' in val)) {
        badKeys.push(key);
      }
    }
    assert.equal(badKeys.length, 0,
      `Fields without label property: ${badKeys.slice(0, 10).join(', ')}`);
  });

  it('all es_ES window entries have a label property', () => {
    const badKeys = [];
    for (const [key, val] of Object.entries(esES.windows)) {
      if (typeof val !== 'object' || val === null || !('label' in val)) {
        badKeys.push(key);
      }
    }
    assert.equal(badKeys.length, 0,
      `Windows without label property: ${badKeys.slice(0, 10).join(', ')}`);
  });

  it('all es_ES tab entries have a label property', () => {
    const badKeys = [];
    for (const [key, val] of Object.entries(esES.tabs)) {
      if (typeof val !== 'object' || val === null || !('label' in val)) {
        badKeys.push(key);
      }
    }
    assert.equal(badKeys.length, 0,
      `Tabs without label property: ${badKeys.slice(0, 10).join(', ')}`);
  });

  it('all es_ES menu entries have a label property', () => {
    const badKeys = [];
    for (const [key, val] of Object.entries(esES.menus)) {
      if (typeof val !== 'object' || val === null || !('label' in val)) {
        badKeys.push(key);
      }
    }
    assert.equal(badKeys.length, 0,
      `Menus without label property: ${badKeys.slice(0, 10).join(', ')}`);
  });

  it('es_ES.json is valid JSON (no trailing commas, correct encoding)', () => {
    // Already parsed without error in before(), but verify encoding
    const raw = readFileSync(new URL('../es_ES.json', import.meta.url), 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw), 'es_ES.json must be valid JSON');
  });

  it('es_ES field labels are not empty strings for at least 90% of entries', () => {
    const total = Object.keys(esES.fields).length;
    let nonEmpty = 0;
    for (const val of Object.values(esES.fields)) {
      if (typeof val === 'object' && val.label && val.label.trim().length > 0) {
        nonEmpty++;
      }
    }
    const ratio = nonEmpty / total;
    assert.ok(ratio > 0.9, `Expected >90% non-empty labels, got ${(ratio * 100).toFixed(1)}% (${nonEmpty}/${total})`);
  });

  it('spot-check: known Spanish translations are correct', () => {
    // These are verified Etendo Spanish labels
    assert.equal(esES.fields['CheckDate']?.label, 'Fecha');
    assert.equal(esES.fields['Deletepayment']?.label, 'Borrar pago');
    assert.equal(esES.fields['Quantity']?.label, 'Cantidad');
  });
});

// ── ETP-5316: BACKEND_ERROR_KEY_MAP ↔ locale parity ─────────────────────────
//
// `BACKEND_ERROR_KEY_MAP` (backendErrors.js) maps an AD_MESSAGE search key to an i18n key, and
// `translateByMessageKey` only accepts the result when `t(key) !== key`. So a map entry pointing
// at a locale key that does not exist fails SILENTLY: the key route returns null, the text route
// cannot match (the core sentence embeds per-document AD line numbers), and the user reads the
// raw core sentence again — the exact symptom this ticket set out to remove, with nothing
// failing anywhere. This guard binds the map to both shipped `genericLabels` dictionaries so a
// new entry added without its two locale strings fails here instead.
//
// The map is module-private on purpose (it is an implementation detail of translateBackendError),
// so it is read from the source text rather than imported.
describe('BACKEND_ERROR_KEY_MAP locale parity (ETP-5316)', () => {
  let mappedKeys;
  let esES;
  let enUS;

  before(() => {
    esES = JSON.parse(readFileSync(new URL('../es_ES.json', import.meta.url), 'utf8'));
    enUS = JSON.parse(readFileSync(new URL('../en_US.json', import.meta.url), 'utf8'));

    const src = readFileSync(new URL('../../lib/backendErrors.js', import.meta.url), 'utf8');
    const block = src.match(/const BACKEND_ERROR_KEY_MAP = \{([\s\S]*?)\n\};/);
    assert.ok(block, 'BACKEND_ERROR_KEY_MAP must exist in lib/backendErrors.js');
    mappedKeys = [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  });

  it('parses a non-empty set of i18n keys out of the map (guards the guard)', () => {
    assert.ok(mappedKeys.length >= 8,
      `expected at least the 8 M_INOUT_POST entries, parsed ${mappedKeys.length}`);
    assert.ok(mappedKeys.every((k) => k.startsWith('backendError.')),
      `every mapped value must be a backendError.* key, got: ${mappedKeys.join(', ')}`);
  });

  for (const locale of ['en_US', 'es_ES']) {
    it(`${locale} defines a non-empty genericLabels entry for every mapped key`, () => {
      const labels = (locale === 'es_ES' ? esES : enUS).genericLabels ?? {};
      const missing = mappedKeys.filter(
        (k) => typeof labels[k] !== 'string' || labels[k].trim() === '',
      );
      assert.equal(missing.length, 0, `${locale} is missing: ${missing.join(', ')}`);
    });
  }

  it('does not leave the Spanish entries as a verbatim copy of the English ones', () => {
    // A copy-paste placeholder would satisfy the parity check above while still showing English
    // to a Spanish tenant, which is treated as a bug (CLAUDE.md § i18n).
    const untranslated = mappedKeys.filter(
      (k) => esES.genericLabels[k] === enUS.genericLabels[k],
    );
    assert.equal(untranslated.length, 0, `still English in es_ES: ${untranslated.join(', ')}`);
  });

  it('does not put the AD line numbers back into the copy', () => {
    // The whole point of mapping by key is that the core sentence's "línea 10, 20, 30" is
    // meaningless to the user — AD line numbers, not grid positions. Our own wording must not
    // reintroduce a line reference.
    const offenders = mappedKeys.filter((k) => /l[ií]nea\s+\d|line\s+\d/i.test(
      `${esES.genericLabels[k]} ${enUS.genericLabels[k]}`,
    ));
    assert.equal(offenders.length, 0, `copy cites a line number in: ${offenders.join(', ')}`);
  });
});
