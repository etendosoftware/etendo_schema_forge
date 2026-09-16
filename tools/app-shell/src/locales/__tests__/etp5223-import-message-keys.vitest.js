import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5223 — the Product Import flow showed English text in a Spanish session.
 *
 * Three of the reported strings were hardcoded English literals with no locale entry at all:
 * the two end-of-import toasts in `ImportDialog`, and the `ImportParseError` messages thrown
 * by `parseDelimited`/`parseXlsx` ("The file is empty.", `Duplicate column header: "…"`).
 * Those modules now carry a `messageKey` instead of only a message, and the dialog resolves
 * it through `useUI` — which means a missing entry here degrades silently back to English
 * with nothing failing anywhere. This suite is the guard against that silence.
 *
 * es_AR is asserted alongside es_ES on purpose: the import dialog is used by Argentine
 * tenants, and es_AR lags the other two dictionaries, so a key added to only en_US/es_ES
 * would leave exactly those users reading English.
 *
 * The placeholders are asserted to appear EXACTLY ONCE: `useUI` interpolates with
 * `text.replace('{p}', value)` (app-shell-core/src/i18n/useUI.js), and String.replace with a
 * string pattern substitutes the FIRST occurrence only — a repeated placeholder renders
 * literally on screen. Same trap already documented for `{days}` in
 * etp5181-fetch-interval-key.vitest.js.
 */

/** key → the placeholder it must interpolate, or null when it takes none. */
const KEYS = {
  importSuccessToast: '{count}',
  importSkippedToast: '{count}',
  importErrorFileEmpty: null,
  importErrorDuplicateHeader: '{header}',
  importErrorUnreadableXlsx: '{detail}',
  importErrorMultipleSheets: '{sheets}',
  importErrorUnknown: null,
};

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };
const SPANISH = { es_ES: esES, es_AR: esAR };

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

const KEY_NAMES = Object.keys(KEYS);

describe.each(Object.keys(DICTIONARIES))('ETP-5223 — import message keys in %s', (name) => {
  const dictionary = DICTIONARIES[name];

  it.each(KEY_NAMES)('declares genericLabels.%s with a non-empty value', (key) => {
    const value = dictionary.genericLabels?.[key];
    expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
  });

  it.each(KEY_NAMES)('interpolates %s\'s placeholder exactly once', (key) => {
    const placeholder = KEYS[key];
    if (placeholder === null) return;
    expect(
      occurrences(dictionary.genericLabels[key], placeholder),
      `${name}.genericLabels.${key} must carry ${placeholder} exactly once — useUI only replaces the first`,
    ).toBe(1);
  });

  // `%s` / `%0` are backend AD_MESSAGE template markers. useUI only interpolates `{name}`, so
  // one leaking into a frontend locale string renders literally on screen (shipped as ETP-5109).
  it.each(KEY_NAMES)('uses no backend template marker in %s', (key) => {
    const value = dictionary.genericLabels[key];
    expect(value, `${name}.genericLabels.${key} carries a %s marker useUI cannot interpolate`).not.toMatch(/%s/);
    expect(value, `${name}.genericLabels.${key} carries a %0 marker useUI cannot interpolate`).not.toMatch(/%\d/);
  });

  // The whole point of the ticket: these were English, and a copy-paste of the English entry
  // into the Spanish dictionaries would reproduce the bug while passing every check above.
  if (name in SPANISH) {
    it.each(KEY_NAMES)('translates %s rather than copying the English entry', (key) => {
      expect(dictionary.genericLabels[key], `${name}.genericLabels.${key} is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
    });
  }
});
