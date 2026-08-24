import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4921 — the keys this ticket added, all resolved through useUI(). A missing one makes
 * useUI() echo the key itself, so the raw identifier renders on screen:
 *
 *  - `financeReconcileEmpty` is the Conciliación panels' empty state. It is deliberately NOT
 *    the Movimientos tab's `financeAccountMovementsEmpty` ("Aún no hay movimientos", paired
 *    there with a "+ Nuevo movimiento" hint): in the reconciliation panels the list is always
 *    the result of a filter, so "not found" is the accurate wording and the hint does not apply.
 *  - `financeReconcileEmptyHint` names the way out of that empty state. The list there is always
 *    a filter result, so the hint points at the date range / status filter rather than nudging
 *    the user to create something, which is what the Movimientos tab's own hint does.
 *  - `financeAccountsColIban` labels the IBAN segment of the Tipo column's two-part sortable
 *    header. It is passed as a `labelKey` inside the `multiField` decorator in decisions.json
 *    precisely so no user-visible string is versioned in that file.
 *  - `financeAccountMovementsColPosted` labels the posting-status segment of the Movimientos Tipo
 *    header. The pre-existing `financeAccountMovementsPosted` is a VALUE label ("Contabilizado"
 *    on the dot), not a column header, so it could not be reused.
 */
const ETP_4921_KEYS = [
  'financeReconcileEmpty',
  'financeReconcileEmptyHint',
  'financeAccountsColIban',
  'financeAccountMovementsColPosted',
];
const LOCALES = ['en_US', 'es_ES', 'es_AR'];

describe('ETP-4921 — accounts list / reconciliation UI key coverage', () => {
  const dictionaries = { en_US: enUS, es_ES: esES, es_AR: esAR };

  for (const locale of LOCALES) {
    for (const key of ETP_4921_KEYS) {
      it(`${locale}.genericLabels.${key} is a non-empty localized string`, () => {
        const value = dictionaries[locale].genericLabels?.[key];
        expect(typeof value, `${locale}.genericLabels.${key} must be a string`).toBe('string');
        expect(value.trim(), `${locale}.genericLabels.${key} must be non-empty`).not.toBe('');
      });
    }
  }

  it('states the reconciliation empty case as a filter result, not as "nothing yet"', () => {
    expect(dictionaries.es_ES.genericLabels.financeReconcileEmpty)
      .toBe('No se han encontrado movimientos');
    expect(dictionaries.es_AR.genericLabels.financeReconcileEmpty)
      .toBe('No se han encontrado movimientos');
    expect(dictionaries.en_US.genericLabels.financeReconcileEmpty).toBe('No movements found');
  });

  // The Movimientos tab keeps its own wording — this ticket only rephrased Conciliación, and
  // that tab's copy is paired with a hint that would read oddly under "not found".
  it('leaves the Movimientos tab empty state untouched', () => {
    for (const locale of LOCALES) {
      const g = dictionaries[locale].genericLabels;
      expect(g.financeAccountMovementsEmpty).not.toBe(g.financeReconcileEmpty);
      expect(typeof g.financeAccountMovementsEmptyHint).toBe('string');
    }
  });

  // IBAN is a proper noun, so unlike most keys it is legitimately identical across locales —
  // asserted explicitly so a future "translate everything" sweep does not invent a variant.
  it('keeps IBAN as-is in every locale', () => {
    for (const locale of LOCALES) {
      expect(dictionaries[locale].genericLabels.financeAccountsColIban).toBe('IBAN');
    }
  });

  // The empty-state hint must point at the filters, not at creating a record: in the
  // reconciliation panels there is nothing for the user to create.
  it('points the reconciliation empty hint at the filters', () => {
    for (const locale of ['es_ES', 'es_AR']) {
      const hint = dictionaries[locale].genericLabels.financeReconcileEmptyHint;
      expect(hint).toMatch(/fechas/);
      expect(hint).toMatch(/estado/);
    }
    expect(dictionaries.en_US.genericLabels.financeReconcileEmptyHint).toMatch(/date range/);
  });

  // The header key is distinct from the value label it sits above.
  it('keeps the posting column header separate from the posting value label', () => {
    for (const locale of LOCALES) {
      const g = dictionaries[locale].genericLabels;
      expect(typeof g.financeAccountMovementsColPosted).toBe('string');
      expect(typeof g.financeAccountMovementsNotPosted).toBe('string');
      expect(g.financeAccountMovementsColPosted).not.toBe(g.financeAccountMovementsNotPosted);
    }
  });
});
