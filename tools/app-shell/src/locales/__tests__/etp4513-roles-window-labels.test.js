import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-4513 — verify the `windows` dictionary entries touched by the "Ventanas
 * asignadas" (Roles overview) window-name-badge translation fix.
 *
 * Covers two previously-missing keys ("Transaction Type" and "Conversion Rate
 * Downloader Log", which had no locale entry at all before and silently fell
 * back to the raw AD_Window.name), plus a regression guard for the corrected
 * "Business Partner" translation: AD_Window id 123 has a hidden legacy
 * menu.json entry literally named "Business Partner", and RolesOverviewPage's
 * window badges look this raw name up via useMenuLabel()/windows[w.name] —
 * the dictionary previously carried a stale pre-rename translation ("Terceros")
 * that leaked into that badge even though the window itself is user-facing as
 * "Contacts"/"Contactos" everywhere else. This test locks in the corrected
 * es_ES value so the stale translation cannot silently regress.
 *
 * The umbrella structural parity is already covered by es_ES-structure.test.js
 * (every top-level/window/tab/menu key must match). This test adds the
 * *per-key* coverage that the structure suite cannot enforce because
 * `windows` is not compared value-by-value (see etp4005-keys.test.js for the
 * established pattern).
 */

describe('ETP-4513 — Roles overview window-name-badge i18n key parity', () => {
  let enUS;
  let esES;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../es_ES.json', import.meta.url), 'utf8'));
  });

  it('en_US.windows exists', () => {
    assert.ok(enUS.windows && typeof enUS.windows === 'object',
      'en_US.json must have a windows object');
  });

  it('es_ES.windows exists', () => {
    assert.ok(esES.windows && typeof esES.windows === 'object',
      'es_ES.json must have a windows object');
  });

  for (const key of ['Transaction Type', 'Conversion Rate Downloader Log']) {
    it(`${key} — present in en_US.windows with a non-empty label`, () => {
      const entry = enUS.windows[key];
      assert.ok(entry && typeof entry === 'object', `en_US.windows["${key}"] must exist`);
      assert.equal(typeof entry.label, 'string', `en_US.windows["${key}"].label must be a string`);
      assert.ok(entry.label.trim().length > 0, `en_US.windows["${key}"].label must be non-empty`);
    });

    it(`${key} — present in es_ES.windows with a non-empty label`, () => {
      const entry = esES.windows[key];
      assert.ok(entry && typeof entry === 'object', `es_ES.windows["${key}"] must exist`);
      assert.equal(typeof entry.label, 'string', `es_ES.windows["${key}"].label must be a string`);
      assert.ok(entry.label.trim().length > 0, `es_ES.windows["${key}"].label must be non-empty`);
    });
  }

  it('es_ES "Transaction Type" is actually translated (not left in English)', () => {
    assert.equal(esES.windows['Transaction Type'].label, 'Tipo de transacción');
  });

  it('es_ES "Conversion Rate Downloader Log" is actually translated (not left in English)', () => {
    assert.equal(
      esES.windows['Conversion Rate Downloader Log'].label,
      'Registro de descarga de tipos de cambio',
    );
  });

  it('"Business Partner" — present in en_US.windows with a non-empty label', () => {
    const entry = enUS.windows['Business Partner'];
    assert.ok(entry && typeof entry === 'object', 'en_US.windows["Business Partner"] must exist');
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.trim().length > 0);
  });

  it('"Business Partner" — present in es_ES.windows with a non-empty label', () => {
    const entry = esES.windows['Business Partner'];
    assert.ok(entry && typeof entry === 'object', 'es_ES.windows["Business Partner"] must exist');
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.trim().length > 0);
  });

  it('REGRESSION GUARD — es_ES "Business Partner" label is "Contactos", not the stale "Terceros"', () => {
    // AD_Window id 123 has TWO menu.json entries: the visible one ("contacts",
    // label "Contacts") and a hidden legacy one ("business-partner", label
    // "Business Partner") left over from a rename. The Roles overview window
    // badge reads the raw AD_Window.name ("Business Partner") via useMenuLabel(),
    // so a stale dictionary entry here surfaces directly in that badge.
    assert.equal(esES.windows['Business Partner'].label, 'Contactos');
    assert.notEqual(esES.windows['Business Partner'].label, 'Terceros');
  });

  it('REGRESSION GUARD — es_ES "Business Partner" newLabel is "Nuevo contacto", not the stale "Nuevo tercero"', () => {
    assert.equal(esES.windows['Business Partner'].newLabel, 'Nuevo contacto');
    assert.notEqual(esES.windows['Business Partner'].newLabel, 'Nuevo tercero');
  });

  it('en_US "Business Partner" label matches the corrected value ("Contacts")', () => {
    assert.equal(enUS.windows['Business Partner'].label, 'Contacts');
  });
});
