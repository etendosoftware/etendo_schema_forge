// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

// Receipts / Payments list summary panel: every key it renders must exist in all shipped locales.
const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };
const KEYS = [
  'paymentSummaryCollected',
  'paymentSummaryPaid',
  'paymentSummaryCollectedInfo',
  'paymentSummaryPaidInfo',
  'paymentSummaryByCurrency',
  'sinDepositar',
  'sinConfirmar',
  'porVencer',
  'borrador',
  'porMetodo',
  'cobrosNoun',
  'pagosNoun',
];

describe('payment summary panel — locale parity', () => {
  for (const [name, dict] of Object.entries(LOCALES)) {
    it.each(KEYS)(`${name} defines a non-empty %s`, (key) => {
      const v = dict.genericLabels?.[key];
      expect(typeof v, `${name}.${key}`).toBe('string');
      expect(v.trim(), `${name}.${key}`).not.toBe('');
    });

    it(`${name} no longer ships the superseded this-month labels`, () => {
      expect(dict.genericLabels).not.toHaveProperty('cobradoEsteMes');
      expect(dict.genericLabels).not.toHaveProperty('pagadoEsteMes');
      expect(JSON.stringify(dict)).not.toMatch(/"(cobrado|pagado)EsteMes"/);
    });
  }

  it('keeps the Collected and Paid titles/tooltips distinct per direction', () => {
    for (const [name, dict] of Object.entries(LOCALES)) {
      expect(dict.genericLabels.paymentSummaryCollected, name).not.toBe(dict.genericLabels.paymentSummaryPaid);
      expect(dict.genericLabels.paymentSummaryCollectedInfo, name).not.toBe(dict.genericLabels.paymentSummaryPaidInfo);
    }
  });
});
