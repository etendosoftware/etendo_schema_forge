// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
import { describe, it, expect } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5053 — the plan-change copy (the /account "Change plan" dialog and the pending-change line)
 * exists in every locale with the same placeholders, so a missing translation can never fall back
 * to a raw key in front of a customer.
 */
const KEYS = [
  'subscriptionPendingChange', 'subscriptionChangePlan', 'subscriptionQuotaYear', 'planChangeTitle',
  'planChangeDescription', 'planChangeUnavailable', 'planChangeNone', 'planChangeTimingImmediate',
  'planChangeTimingPeriodEnd', 'planChangeImmediateNote', 'planChangeIntervalNote',
  'planChangePeriodEndNote', 'planChangeQuotaKept', 'planChangeQuotaFine', 'planChangeQuotaExceeded',
  'planChangeConfirm', 'planChangeDoneImmediate', 'planChangeDoneScheduled',
  'planChangeAlreadyPending', 'planChangeNotAllowed', 'planChangeNotCurrent', 'planChangeFailed',
];

const read = (locale, key) => locale.genericLabels?.[key];
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('ETP-5053 plan change locale keys', () => {
  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('%s has every key', (_, locale) => {
    for (const key of KEYS) {
      expect(read(locale, key), key).toBeTruthy();
    }
  });

  it('keeps the same placeholders in every locale', () => {
    for (const key of KEYS) {
      const expected = placeholders(read(enUS, key));
      expect(placeholders(read(esES, key)), key).toEqual(expected);
      expect(placeholders(read(esAR, key)), key).toEqual(expected);
    }
  });
});
