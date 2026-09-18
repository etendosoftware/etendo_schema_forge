import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5348 — the import accepted files it should have refused, and lost rows in silence.
 *
 * Four new `ImportParseError` keys carry those rejections. Like the ETP-5223 family this sits
 * beside, every one of them degrades SILENTLY back to English when its entry is missing: the
 * dialog resolves `messageKey` through `useUI` and falls back to the error's English `message`,
 * so nothing fails anywhere and nobody notices until a Spanish-speaking user reads the wrong
 * language. This suite is the guard against that silence.
 *
 * es_AR is asserted alongside es_ES for the same reason ETP-5223 gives: it lags the other two
 * dictionaries, so a key added to only en_US/es_ES leaves exactly those tenants reading English.
 *
 * Placeholders are asserted to appear EXACTLY ONCE each, because `useUI` interpolates with
 * `text.replace('{p}', value)` and String.replace with a string pattern substitutes the FIRST
 * occurrence only — a repeated placeholder renders literally on screen.
 *
 * `importErrorTooManyRows` is why this file declares placeholders as an ARRAY rather than reusing
 * the ETP-5223 suite's single-placeholder map: it is the first import message to carry two, and
 * a key whose second placeholder went untranslated would ship `{limit}` visible to the user.
 */

/** key → every placeholder it must interpolate, in no particular order. */
const KEYS = {
  importErrorEmptyHeader: ['{position}'],
  importErrorNoDataRows: [],
  importErrorTooManyRows: ['{count}', '{limit}'],
  importErrorUnsupportedFormat: ['{formats}'],
};

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };
const SPANISH = ['es_ES', 'es_AR'];
const KEY_NAMES = Object.keys(KEYS);

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

describe.each(Object.keys(DICTIONARIES))('ETP-5348 — file rejection keys in %s', (name) => {
  const dictionary = DICTIONARIES[name];

  it.each(KEY_NAMES)('declares genericLabels.%s with a non-empty value', (key) => {
    const value = dictionary.genericLabels?.[key];
    expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
  });

  it.each(KEY_NAMES)('interpolates every placeholder of %s exactly once', (key) => {
    const value = dictionary.genericLabels[key];
    for (const placeholder of KEYS[key]) {
      expect(
        occurrences(value, placeholder),
        `${name}.genericLabels.${key} must carry ${placeholder} exactly once — useUI only replaces the first`,
      ).toBe(1);
    }
  });

  // A placeholder this key does not declare is a typo that renders literally: `{limit}` left in
  // a message the dialog calls with only `{count}` reaches the user as those seven characters.
  it.each(KEY_NAMES)('carries no placeholder beyond the ones %s declares', (key) => {
    const found = dictionary.genericLabels[key].match(/\{[a-zA-Z]+\}/g) ?? [];
    expect(
      [...new Set(found)].sort(),
      `${name}.genericLabels.${key} interpolates something the dialog never passes`,
    ).toEqual([...KEYS[key]].sort());
  });

  // `%s` / `%0` are backend AD_MESSAGE template markers. useUI only interpolates `{name}`, so one
  // leaking into a frontend locale string renders literally on screen (shipped as ETP-5109).
  it.each(KEY_NAMES)('uses no backend template marker in %s', (key) => {
    const value = dictionary.genericLabels[key];
    expect(value, `${name}.genericLabels.${key} carries a %s marker useUI cannot interpolate`).not.toMatch(/%s/);
    expect(value, `${name}.genericLabels.${key} carries a %0 marker useUI cannot interpolate`).not.toMatch(/%\d/);
  });

  // The whole point: these messages exist to be READ, by a user who just had their file refused
  // and needs to know why. A copy-paste of the English entry passes every check above.
  if (SPANISH.includes(name)) {
    it.each(KEY_NAMES)('translates %s rather than copying the English entry', (key) => {
      expect(dictionary.genericLabels[key], `${name}.genericLabels.${key} is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
    });
  }
});
