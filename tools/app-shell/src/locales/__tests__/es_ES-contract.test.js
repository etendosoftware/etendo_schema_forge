import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLabel } from '@etendosoftware/app-shell-core/i18n/resolveLabel';

describe('resolveLabel es_ES.json contract', () => {
  let esES;

  before(async () => {
    const url = new URL('../es_ES.json', import.meta.url);
    const fs = await import('node:fs');
    esES = JSON.parse(fs.readFileSync(url, 'utf8'));
  });

  it('es_ES.json is valid and has fields key', () => {
    assert.ok(esES.fields, 'es_ES.json must have a fields key');
    assert.equal(typeof esES.fields, 'object');
  });

  it('has a substantial number of field translations', () => {
    const count = Object.keys(esES.fields).length;
    assert.ok(count > 1000, `Expected >1000 fields, got ${count}`);
  });

  it('contains actual Spanish translations (not just English fallbacks)', () => {
    // These are known Spanish labels from Etendo
    const label = resolveLabel(esES, 'CheckDate');
    assert.equal(label, 'Fecha');
  });

  it('Deletepayment resolves to Borrar pago', () => {
    assert.equal(resolveLabel(esES, 'Deletepayment'), 'Borrar pago');
  });

  it('es_ES.json has windows, tabs, and menus sections', () => {
    assert.ok(esES.windows, 'must have windows key');
    assert.ok(esES.tabs, 'must have tabs key');
    assert.ok(esES.menus, 'must have menus key');
  });

  it('windows section has entries', () => {
    const count = Object.keys(esES.windows).length;
    assert.ok(count > 50, `Expected >50 windows, got ${count}`);
  });

  it('tabs section has entries', () => {
    const count = Object.keys(esES.tabs).length;
    assert.ok(count > 50, `Expected >50 tabs, got ${count}`);
  });

  it('menus section has entries', () => {
    const count = Object.keys(esES.menus).length;
    assert.ok(count > 50, `Expected >50 menus, got ${count}`);
  });
});
