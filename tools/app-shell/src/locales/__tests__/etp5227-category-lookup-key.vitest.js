import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5227 — the message shown when the product/contact category catalogue cannot be read.
 *
 * It replaces the old behaviour of treating a failed read as an empty catalogue, which sent the
 * import down the auto-create path and surfaced a raw English database complaint about a
 * category that plainly exists. The descriptors resolve it through `config.translate`, so a
 * missing entry degrades SILENTLY to the English fallback compiled into the descriptor — the
 * screen would look fine and be in the wrong language, which is the failure this guards.
 */
const KEY = 'importErrorCategoryLookupFailed';
const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe(`ETP-5227 — genericLabels.${KEY}`, () => {
  it.each(Object.keys(DICTIONARIES))('%s declares it with a non-empty value', (name) => {
    const value = DICTIONARIES[name].genericLabels?.[KEY];
    expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
  });

  // `useUI` interpolates with `text.replace('{category}', value)` — String.replace with a string
  // pattern substitutes the FIRST occurrence only, so a repeat would render literally.
  it.each(Object.keys(DICTIONARIES))('%s names the offending category exactly once', (name) => {
    const value = DICTIONARIES[name].genericLabels[KEY];
    expect(value.split('{category}').length - 1, `${name}.genericLabels.${KEY}`).toBe(1);
  });

  it.each(Object.keys(DICTIONARIES))('%s uses no backend template marker', (name) => {
    const value = DICTIONARIES[name].genericLabels[KEY];
    expect(value, `${name}.genericLabels.${KEY}`).not.toMatch(/%s|%\d/);
  });

  it.each(['es_ES', 'es_AR'])('%s is translated rather than left in English', (name) => {
    expect(DICTIONARIES[name].genericLabels[KEY]).not.toBe(enUS.genericLabels[KEY]);
  });
});
