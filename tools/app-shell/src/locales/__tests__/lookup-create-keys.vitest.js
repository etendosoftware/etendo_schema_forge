import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5254 — the "Crear producto" affordance inside the product lookup drawer.
 *
 * Three generic labels feed it: the pinned CTA row in the drawer, the creation dialog's title,
 * and the save-failure message.
 *
 * Deliberately NOT here: the tab captions. The popup renders the target window's own tab
 * strip (`renderPrimaryTabButtons` with the labels from `window.primaryTabs`), so those
 * captions resolve from the MENU dictionary, not from `genericLabels`. The earlier
 * `createProductTabGeneral` / `createProductAdditional` keys were removed for exactly that
 * reason — the guard below keeps them from creeping back as dead entries.
 *
 * All THREE dictionaries are asserted (unlike the bank-connection suites, which only cover
 * en_US + es_ES): the affordance lands on the seven document windows every tenant uses, and
 * es_AR is a first-class locale for them. `locales/generated/` is build output (gitignored)
 * and is deliberately not asserted here.
 *
 * These keys carry no interpolation placeholders on purpose — `useUI` substitutes only the
 * FIRST occurrence of each `{name}` token, and none of this copy needs a runtime value. A
 * `{`/`%s`/`%0` sneaking in would render literally on screen (the ETP-5109 failure mode).
 */

const KEYS = [
  'createProduct',
  'createProductTitle',
  'createProductError',
];

/**
 * Keys the popup used to own and no longer does. Asserted ABSENT so they cannot come back as
 * dead entries — or worse, as live copy nobody renders.
 *
 * - `createProductTabGeneral` / `createProductAdditional`: superseded by the menu dictionary
 *   once the popup adopted the target window's own tab strip.
 * - `createProductCostWarning`: "a stockable product needs a cost" belongs to the Products
 *   window, which enforces it with a blocking banner. Restating it in the popup was one rule
 *   in two places, free to drift.
 */
const RETIRED_KEYS = [
  'createProductTabGeneral',
  'createProductAdditional',
  'createProductCostWarning',
];

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

const CASES = Object.entries(DICTIONARIES).flatMap(
  ([name, dictionary]) => KEYS.map((key) => [name, key, dictionary]),
);

describe('ETP-5254 — product lookup create labels', () => {
  it.each(CASES)('%s declares genericLabels.%s with a non-empty string', (name, key, dictionary) => {
    const value = dictionary.genericLabels?.[key];
    expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
  });

  it.each(CASES)('%s.%s carries no interpolation or backend template markers', (name, key, dictionary) => {
    const value = dictionary.genericLabels[key];
    expect(value, `${name}.genericLabels.${key} carries a {placeholder} nothing interpolates`)
      .not.toMatch(/\{[a-zA-Z]+\}/);
    expect(value, `${name}.genericLabels.${key} carries a %s marker useUI cannot interpolate`)
      .not.toMatch(/%s/);
    expect(value, `${name}.genericLabels.${key} carries a %0 marker useUI cannot interpolate`)
      .not.toMatch(/%\d/);
  });

  it.each(KEYS)('%s is translated in es_ES rather than left in English', (key) => {
    expect(esES.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
  });

  it.each(KEYS)('%s is translated in es_AR rather than left in English', (key) => {
    expect(esAR.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
  });

  it.each(Object.entries(DICTIONARIES))('%s carries no retired keys', (name, dictionary) => {
    for (const key of RETIRED_KEYS) {
      expect(
        dictionary.genericLabels,
        `${name}.genericLabels.${key} is dead — see RETIRED_KEYS for why it was dropped`,
      ).not.toHaveProperty(key);
    }
  });
});
