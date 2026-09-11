import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5245 — every user-visible string the Product cost feature can produce.
 *
 * Two families, both resolved through `useUI()`, which echoes the KEY when the active locale has
 * no entry for it (there is no locale-to-locale fallback in LocaleProvider):
 *
 *  - `productCostRequired`, the blocking banner (`ProductCostBanner`) and the save-gate toast
 *    (`useEntity.performSave`). A missing entry here would show the user a bare identifier at the
 *    exact moment they are being refused a save — the worst possible time to be unhelpful.
 *  - `backendError.costing*`, the five refusals `ProductCostingHandler` returns. Those cross the
 *    wire in English and are translated client-side by `lib/backendErrors.js`; a missing entry
 *    makes `translateBackendError` fall back to the raw English sentence, silently.
 *
 * es_AR is asserted alongside the other two even though none of these keys is Argentina-specific:
 * it is a full, independent dictionary. `locales/generated/core.*.json` is gitignored build
 * output and is deliberately NOT asserted here.
 */

const BANNER_KEY = 'productCostRequired';
/** One per ProductCostingHandler.ERR_* constant, mapped in lib/backendErrors.js. */
const BACKEND_ERROR_KEYS = [
  'backendError.costingNoProduct',
  'backendError.costingCostRequired',
  'backendError.costingCostNegative',
  'backendError.costingInvalidDateRange',
  'backendError.costingEngineRowLocked',
  'backendError.costingPrepareFailed',
];
const ALL_KEYS = [BANNER_KEY, ...BACKEND_ERROR_KEYS];

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5245 — product cost i18n keys', () => {
  it.each(Object.entries(DICTIONARIES))(
    '%s declares every key in genericLabels with a non-empty value',
    (name, dictionary) => {
      for (const key of ALL_KEYS) {
        const value = dictionary.genericLabels?.[key];
        expect(typeof value, `${name}.genericLabels['${key}'] must be a string`).toBe('string');
        expect(value.trim(), `${name}.genericLabels['${key}'] must be non-empty`).not.toBe('');
      }
    },
  );

  it('declares the same set of keys in all three locales (no drift)', () => {
    for (const key of ALL_KEYS) {
      const declaredIn = Object.entries(DICTIONARIES)
        .filter(([, dictionary]) => key in (dictionary.genericLabels ?? {}))
        .map(([name]) => name);
      expect(declaredIn, `'${key}' must exist in every locale`)
        .toEqual(['en_US', 'es_ES', 'es_AR']);
    }
  });

  it('translates the Spanish locales rather than copying the English text', () => {
    for (const key of ALL_KEYS) {
      expect(esES.genericLabels[key], `es_ES['${key}'] is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
      expect(esAR.genericLabels[key], `es_AR['${key}'] is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
    }
  });

  it('points the banner text at the Cost tab, in every locale', () => {
    // The message is only actionable if it says WHERE to fix it — the save is blocked until then.
    expect(enUS.genericLabels[BANNER_KEY].toLowerCase()).toContain('cost');
    expect(esES.genericLabels[BANNER_KEY].toLowerCase()).toContain('costo');
    expect(esAR.genericLabels[BANNER_KEY].toLowerCase()).toContain('costo');
  });

  /**
   * The rule was widened by product decision to cover EVERY product type, so the copy may no
   * longer scope itself to stockable/warehouse products — a user looking at a service must not be
   * told the warning does not concern them while the save is being refused.
   */
  it('does not scope the banner copy to stockable products in any locale', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      expect(dictionary.genericLabels[BANNER_KEY], `${name} still scopes the copy to stock`)
        .not.toMatch(/stock|almacen/i);
    }
  });

  it('never leaves an untranslated placeholder or a stray key name in the values', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      for (const key of ALL_KEYS) {
        const value = dictionary.genericLabels[key];
        expect(value, `${name}['${key}'] echoes its own key`).not.toBe(key);
        expect(value, `${name}['${key}'] carries a TODO/placeholder`)
          .not.toMatch(/TODO|FIXME|\{\{/i);
      }
    }
  });
});
