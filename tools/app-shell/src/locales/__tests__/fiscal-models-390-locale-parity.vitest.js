// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_AR.json
//
// Modelo 390 and the Organization "Representante legal / Modelo 390" identity are shipped in
// every locale: each of their keys defined in es_ES must exist, non-empty, in en_US and es_AR,
// with the same interpolation placeholders (a missing `{date}` would print a raw placeholder).
// The presentation dialogs the 390 reuses (PresentModal `fm.present.*`, AeatSubmitFlow
// `fm.aeat.*`) are covered too: there is no locale-to-locale fallback, so a key missing in
// es_AR shows the raw key.
import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

const KEY_PATTERN = /^(fm\.m390\.|fm\.aeat\.|fm\.present\.|fm\.catalog\.390\.|fm\.config\.m390\.|fm\.catalog\.sii_warning|org390|orgRep|orgSection390|orgIaeCapHint|orgIaeOverCapWarning)/;

const keys = Object.keys(esES.genericLabels).filter(k => KEY_PATTERN.test(k));
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('Modelo 390 / Organization identity — locale parity', () => {
  it('covers the expected key families', () => {
    expect(keys.length).toBeGreaterThan(150);
    expect(keys).toEqual(expect.arrayContaining([
      'fm.m390.result.positive', 'org390RepPairRequired', 'orgRepLegalEntityHint', 'orgIaeCapHint',
      'fm.catalog.sii_warning_since_title', 'fm.catalog.sii_warning_since_body', 'fm.present.conformity', 'fm.aeat.error.blockingIncidents',
      'fm.m390.submission.title', 'fm.m390.substitute.action',
    ]));
  });

  it.each([['en_US', enUS], ['es_AR', esAR]])('%s defines every key, non-empty, with the same placeholders', (name, dict) => {
    const missing = keys.filter(k => typeof dict.genericLabels?.[k] !== 'string' || dict.genericLabels[k].trim() === '');
    expect(missing, `${name} missing`).toEqual([]);
    const mismatched = keys.filter(k => placeholders(dict.genericLabels[k]).join() !== placeholders(esES.genericLabels[k]).join());
    expect(mismatched, `${name} placeholders`).toEqual([]);
  });
});
