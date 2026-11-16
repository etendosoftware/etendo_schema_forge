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

// The 390 file validation, its Incidencias banner text and the validation step of the direct
// presentation: named one by one so that a key dropped from es_ES too is still caught.
const VALIDATION_KEYS = [
  'fm.m390.file_validation.validating', 'fm.m390.file_validation.accepted',
  'fm.m390.file_validation.warnings.title', 'fm.m390.file_validation.warnings.body',
  'fm.m390.file_validation.rejected.title', 'fm.m390.file_validation.rejected.body',
  'fm.m390.file_validation.unavailable.title', 'fm.m390.file_validation.unavailable.body',
  'fm.m390.file_validation.view_incidents', 'fm.m390.file_validation.error_line',
  'fm.incidents.review_sub',
  'fm.aeat.action.validating_submitting', 'fm.aeat.result.validation_rejected.title',
  'fm.aeat.error.validationUnavailable', 'fm.aeat.warnings.title',
];
// The direct presentation is no longer called "telemática" / "telematic" in these texts.
const RENAMED_KEYS = [
  'fm.present.path.aeat', 'fm.aeat.title', 'fm.present.aeat_section.desc', 'fm.m390.submission.method_telematic',
];
const LOCALES = [['es_ES', esES], ['en_US', enUS], ['es_AR', esAR]];
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

describe('Modelo 390 file validation / direct presentation — texts (ETP-5716)', () => {
  it.each(LOCALES)('%s defines every validation key, non-empty', (name, dict) => {
    const missing = VALIDATION_KEYS.filter(k => typeof dict.genericLabels?.[k] !== 'string' || dict.genericLabels[k].trim() === '');
    expect(missing, `${name} missing`).toEqual([]);
  });

  it('every fm.m390.file_validation.* key of any locale is one of the named ones', () => {
    const found = new Set(LOCALES.flatMap(([, dict]) => Object.keys(dict.genericLabels).filter(k => k.startsWith('fm.m390.file_validation.'))));
    expect([...found].sort()).toEqual(VALIDATION_KEYS.filter(k => k.startsWith('fm.m390.file_validation.')).sort());
  });

  it.each(LOCALES)('%s: an AEAT error line carries its code and its message', (_name, dict) => {
    expect(placeholders(dict.genericLabels['fm.m390.file_validation.error_line'])).toEqual(['code', 'message']);
  });

  it.each(LOCALES)('%s: the renamed direct-presentation texts do not say "telemátic" / "telematic"', (name, dict) => {
    const offending = RENAMED_KEYS.filter(k => /telem[aá]tic/i.test(String(dict.genericLabels?.[k] ?? '')));
    expect(offending, `${name} still telematic`).toEqual([]);
    const missing = RENAMED_KEYS.filter(k => typeof dict.genericLabels?.[k] !== 'string' || dict.genericLabels[k].trim() === '');
    expect(missing, `${name} missing`).toEqual([]);
  });

  // Any Fiscal Models text (the whole `fm.` namespace), not only the renamed ones: a new key that
  // says "telemática" must fail too. Keys outside `fm.` are another feature and are not checked.
  it.each(LOCALES)('%s: no Fiscal Models (fm.*) text says "telemátic" / "telematic"', (name, dict) => {
    const fmKeys = Object.keys(dict.genericLabels).filter(k => k.startsWith('fm.'));
    expect(fmKeys.length).toBeGreaterThan(150);
    const offending = fmKeys.filter(k => /telem[aá]tic/i.test(String(dict.genericLabels[k])));
    expect(offending, `${name} still telematic`).toEqual([]);
  });
});
