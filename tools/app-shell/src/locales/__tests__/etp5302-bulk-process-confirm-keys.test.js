import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5302 — the bulk document action bar said the wrong word twice.
 *
 * The floating selection toolbar's button used `genericLabels.confirmBulk`
 * ("Confirmar") while the DR→CO option inside its dialog used
 * `genericLabels.book` — which is ALSO "Procesar" in Spanish. So the button
 * said "Confirmar" and the only action it offered said "Procesar": exactly
 * inverted from the intended wording.
 *
 * After the fix:
 *   - the button uses `genericLabels.process`  → "Procesar"  (every call site)
 *   - the CO option uses `genericLabels.confirm` → "Confirmar" (BulkDocumentAction)
 *   - `confirmBulk` is deleted from all three locale files — nothing reads it.
 *
 * `book` itself is intentionally left in place: it is a legitimate generic
 * label; it just is not what the bulk CO option should point at.
 */

const LOCALES = ['es_ES', 'es_AR', 'en_US'];

describe('ETP-5302 — bulk action label keys', () => {
  const data = {};

  before(() => {
    for (const loc of LOCALES) {
      data[loc] = JSON.parse(readFileSync(new URL(`../../locales/${loc}.json`, import.meta.url), 'utf8'));
    }
  });

  for (const loc of LOCALES) {
    it(`${loc} no longer defines the removed genericLabels.confirmBulk key`, () => {
      assert.equal(
        Object.hasOwn(data[loc].genericLabels, 'confirmBulk'),
        false,
        'confirmBulk has no readers left — every BulkDocumentAction call site now passes labelKey="process"',
      );
    });

    it(`${loc} defines both keys the bulk dialog now needs (process + confirm)`, () => {
      assert.equal(typeof data[loc].genericLabels.process, 'string');
      assert.equal(typeof data[loc].genericLabels.confirm, 'string');
    });
  }

  it('the Spanish locales read "Procesar" on the button and "Confirmar" on the option', () => {
    for (const loc of ['es_ES', 'es_AR']) {
      assert.equal(data[loc].genericLabels.process, 'Procesar');
      assert.equal(data[loc].genericLabels.confirm, 'Confirmar');
    }
  });

  it('the two keys are distinct words in Spanish — the whole point of the ticket', () => {
    for (const loc of ['es_ES', 'es_AR']) {
      assert.notEqual(data[loc].genericLabels.process, data[loc].genericLabels.confirm);
    }
  });

  it('never points the CO option back at `book`, which is also "Procesar" in Spanish', () => {
    // Documents the trap: `book` and `process` are different KEYS with the same
    // Spanish VALUE, so reusing `book` for the option would silently restore the
    // "Procesar / Procesar" duplication the ticket removed.
    for (const loc of ['es_ES', 'es_AR']) {
      assert.equal(data[loc].genericLabels.book, data[loc].genericLabels.process);
    }
  });
});
