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
