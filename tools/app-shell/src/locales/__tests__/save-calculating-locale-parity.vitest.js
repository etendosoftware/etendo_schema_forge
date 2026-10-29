// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * `saveCalculating` is the Save button's tooltip while a custom form component still has a
 * result in flight that must land before the record is saved (lib/formPendingWork.js). `useUI()`
 * echoes the raw key when a locale has no entry, so a gap would show `saveCalculating` as literal
 * text on a disabled button. `es_ES-structure.test.js` does not cover `genericLabels`, hence the
 * per-key guard (same pattern as etp5133-saving-line-tooltip-locale-parity.vitest.js).
 */
const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('saveCalculating locale parity', () => {
  for (const [name, dictionary] of Object.entries(LOCALES)) {
    it(`${name} defines saveCalculating under genericLabels`, () => {
      const value = dictionary.genericLabels?.saveCalculating;
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    });
  }

  it('matches the expected copy and the Spanish locales do not ship the English one', () => {
    expect(enUS.genericLabels.saveCalculating).toBe('Calculating…');
    expect(esES.genericLabels.saveCalculating).toBe('Calculando…');
    expect(esAR.genericLabels.saveCalculating).toBe('Calculando…');
  });
});
