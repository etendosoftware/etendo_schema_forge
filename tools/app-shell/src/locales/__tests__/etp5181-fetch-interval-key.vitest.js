import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';

/**
 * ETP-5181 — the "Importar desde" advisory shown when the requested start date predates the
 * provider's published `max_fetch_interval`.
 *
 * Only en_US and es_ES are asserted: `locales/generated/` is build output (gitignored) and
 * es_AR carries no `financeAccountsBankConnection*` keys at all, so the bank-connection panel
 * already resolves its whole label set from the two dictionaries checked here.
 *
 * The `{days}` placeholder is asserted to appear EXACTLY ONCE on purpose. `useUI` interpolates
 * with `text.replace('{days}', value)` (app-shell-core/src/i18n/useUI.js) — String.replace with a
 * string pattern substitutes the FIRST occurrence only, so a second `{days}` would render
 * literally in the UI. This is the same trap already documented for
 * `backendError.psd2ImportDateBeyondMaxInterval` in lib/backendErrors.js; do not "restore" a
 * repetition here without first making that interpolation global.
 */

const KEY = 'financeAccountsBankConnectionImportBeyondFetchInterval';
const PLACEHOLDER = '{days}';

const DICTIONARIES = { en_US: enUS, es_ES: esES };

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

describe(`ETP-5181 — genericLabels.${KEY}`, () => {
  it.each(Object.entries(DICTIONARIES))('%s declares the key with a non-empty value', (name, dictionary) => {
    const value = dictionary.genericLabels?.[KEY];
    expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
  });

  it.each(Object.entries(DICTIONARIES))('%s interpolates the day count exactly once', (name, dictionary) => {
    const value = dictionary.genericLabels[KEY];
    expect(
      occurrences(value, PLACEHOLDER),
      `${name}.genericLabels.${KEY} must carry ${PLACEHOLDER} exactly once — useUI only replaces the first`,
    ).toBe(1);
  });

  it.each(Object.entries(DICTIONARIES))('%s does not hardcode a day count', (name, dictionary) => {
    // A literal "90" would freeze the regulation's baseline into the copy, and providers do
    // publish other intervals — the number must come from the param.
    expect(dictionary.genericLabels[KEY], `${name}.genericLabels.${KEY} hardcodes a day count`)
      .not.toMatch(/\d/);
  });

  // Deliberately structural, not a full-sentence match: pinning user-facing copy makes every
  // wording tweak fail a test for no behavioural reason.
  //
  // `%s` / `%0` are the backend AD_MESSAGE template markers. useUI only interpolates `{name}`, so
  // one of those leaking into a frontend locale string renders literally on screen — exactly what
  // shipped as ETP-5109. The `%0` half of this is currently implied by the no-digits case above;
  // it is asserted explicitly so the guard survives that rule ever being relaxed.
  it.each(Object.entries(DICTIONARIES))('%s uses no backend template markers', (name, dictionary) => {
    const value = dictionary.genericLabels[KEY];
    expect(value, `${name}.genericLabels.${KEY} carries a %s marker useUI cannot interpolate`)
      .not.toMatch(/%s/);
    expect(value, `${name}.genericLabels.${KEY} carries a %0 marker useUI cannot interpolate`)
      .not.toMatch(/%\d/);
  });

  it('is translated in es_ES rather than left in English', () => {
    expect(esES.genericLabels[KEY]).not.toBe(enUS.genericLabels[KEY]);
  });
});
