import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5106 — the invoice grid's outstanding-amount column label.
 *
 * The column was renamed from "Pendiente de pago" / "Pending Payment" to balance wording. The
 * effective source of the rendered header is `window.labelOverrides.OutstandingAmt` (see the
 * companion suite `windows/custom/shared/__tests__/etp5106-invoice-label-overrides-sync.test.js`),
 * but `genericLabels.pendingPaymentColumn` is the declared `col.label` fallback of both header
 * tables, so leaving it on the retired wording would silently resurface the old text if the
 * resolution chain in `lib/resolveColumnLabel.js` ever changes.
 *
 * es_AR is asserted alongside the other two because `useUI()` echoes the raw key when the active
 * locale has no entry for it — there is no locale-to-locale fallback in LocaleProvider — so a gap
 * here renders the identifier `pendingPaymentColumn` on screen rather than degrading to Spanish.
 * es_AR was in fact missing this key before this ticket.
 */

const KEY = 'pendingPaymentColumn';
const ES_LABEL = 'Saldo pendiente';
const EN_LABEL = 'Outstanding Amount';
const RETIRED_LABELS = ['Pendiente de pago', 'Pending Payment'];

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5106 — pendingPaymentColumn label', () => {
  it.each(Object.entries(DICTIONARIES))('%s declares the key with a non-empty value', (name, dictionary) => {
    const value = dictionary.genericLabels?.[KEY];
    expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
  });

  it('uses the renamed Spanish label in both Spanish locales', () => {
    expect(esES.genericLabels[KEY]).toBe(ES_LABEL);
    expect(esAR.genericLabels[KEY]).toBe(ES_LABEL);
  });

  it('uses the renamed English label in en_US', () => {
    expect(enUS.genericLabels[KEY]).toBe(EN_LABEL);
  });

  it.each(Object.entries(DICTIONARIES))('%s no longer carries the retired wording', (name, dictionary) => {
    expect(RETIRED_LABELS, `${name}.genericLabels.${KEY} kept the pre-ETP-5106 text`)
      .not.toContain(dictionary.genericLabels[KEY]);
  });
});
