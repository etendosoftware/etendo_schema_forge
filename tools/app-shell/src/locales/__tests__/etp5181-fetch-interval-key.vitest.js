// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
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

/**
 * The structural guard set applied to every `{days}`-carrying fetch-interval string.
 *
 * Factored out because the requirement has TWO surfaces with the same constraints: the panel
 * advisory (`financeAccounts…ImportBeyondFetchInterval`) and the sync toast
 * (`backendError.psd2ImportDateBeyondMaxInterval`, reworded in the QA re-review of #1366). Both
 * are interpolated by the same `useUI` and both mirror the same backend AD_MESSAGE, so a guard
 * that only covered one of them would let the other drift.
 */
function describeFetchIntervalKey(ticket, key) {
  describe(`${ticket} — genericLabels.${key}`, () => {
    it.each(Object.entries(DICTIONARIES))('%s declares the key with a non-empty value', (name, dictionary) => {
      const value = dictionary.genericLabels?.[key];
      expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
      expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
    });

    it.each(Object.entries(DICTIONARIES))('%s interpolates the day count exactly once', (name, dictionary) => {
      const value = dictionary.genericLabels[key];
      expect(
        occurrences(value, PLACEHOLDER),
        `${name}.genericLabels.${key} must carry ${PLACEHOLDER} exactly once — useUI only replaces the first`,
      ).toBe(1);
    });

    it.each(Object.entries(DICTIONARIES))('%s does not hardcode a day count', (name, dictionary) => {
      // A literal "90" would freeze the regulation's baseline into the copy, and providers do
      // publish other intervals — the number must come from the param.
      expect(dictionary.genericLabels[key], `${name}.genericLabels.${key} hardcodes a day count`)
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
      const value = dictionary.genericLabels[key];
      expect(value, `${name}.genericLabels.${key} carries a %s marker useUI cannot interpolate`)
        .not.toMatch(/%s/);
      expect(value, `${name}.genericLabels.${key} carries a %0 marker useUI cannot interpolate`)
        .not.toMatch(/%\d/);
    });

    it('is translated in es_ES rather than left in English', () => {
      expect(esES.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
    });
  });
}

describeFetchIntervalKey('ETP-5181', KEY);

/**
 * The toast half of the same requirement.
 *
 * `backendError.psd2ImportDateBeyondMaxInterval` is what `lib/backendErrors.js` resolves when the
 * sync itself answers WARNING with the PSD2 module's English AD_MESSAGE (which carries no usable
 * es_ES translation — see that file). Its wording was reworked in the QA re-review of #1366 so the
 * toast and the panel advisory say the same thing; only the structure is pinned here, for the same
 * reason as above. The MATCHER is keyed off the untouched English wire text and is covered by
 * `lib/__tests__/backendErrors.test.js`, not here.
 */
describeFetchIntervalKey('ETP-5181 QA', 'backendError.psd2ImportDateBeyondMaxInterval');

/**
 * ETP-6151 — the "Importar desde" help line names the bank's limit with the same `{days}`
 * interpolation, so it gets the same structural guards.
 */
describeFetchIntervalKey('ETP-6151', 'financeAccountsBankConnectionImportFromHelpLimit');

/**
 * ETP-6151 — the rest of the import-settings copy shared by the connect modal and the edit panel
 * (`BankImportSettingsFields`): help lines, per-grouping help and the two required errors. Like
 * the advisory above, only en_US and es_ES carry `financeAccountsBankConnection*` keys.
 *
 * The grouping is required when the flag `psd2-statement-import-settings` is on, which no longer
 * offers the empty "Default" option; the flag-off panel still does, so its label stays declared.
 */
describe('ETP-6151 — bank import-settings keys', () => {
  const KEYS = [
    'financeAccountsBankConnectionImportFromHelp',
    'financeAccountsBankConnectionImportFromRequired',
    'financeAccountsBankConnectionGroupingHelp',
    'financeAccountsBankConnectionGroupingHelp_1BD',
    'financeAccountsBankConnectionGroupingHelp_1BW',
    'financeAccountsBankConnectionGroupingHelp_1BM',
    'financeAccountsBankConnectionGroupingHelp_1BE',
    'financeAccountsBankConnectionGroupingRequired',
  ];

  describe.each(Object.entries(DICTIONARIES))('%s', (name, dictionary) => {
    it.each(KEYS)('declares %s with a non-empty value', (key) => {
      const value = dictionary.genericLabels?.[key];
      expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
      expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
    });

    it.each(KEYS)('%s carries no placeholder or backend template marker', (key) => {
      // None of these is interpolated: a `{x}` would render literally, and so would `%s` / `%0`.
      expect(dictionary.genericLabels[key]).not.toMatch(/\{[^}]*\}|%s|%\d/);
    });

    it('labels each of the four groupings', () => {
      for (const id of ['1BD', '1BW', '1BM', '1BE']) {
        expect(dictionary.genericLabels[`financeAccountsBankConnectionGrouping_${id}`]).toBeTruthy();
      }
    });

    it('still declares the empty "Default" grouping label (the flag-off edit panel renders it)', () => {
      expect(dictionary.genericLabels.financeAccountsBankConnectionGroupingNone).toBeTruthy();
    });
  });

  it.each(KEYS)('%s is translated in es_ES rather than left in English', (key) => {
    expect(esES.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
  });

  it('gives each grouping its own help sentence', () => {
    for (const dictionary of Object.values(DICTIONARIES)) {
      const helps = ['1BD', '1BW', '1BM', '1BE', '']
        .map((id) => dictionary.genericLabels[`financeAccountsBankConnectionGroupingHelp${id ? `_${id}` : ''}`]);
      expect(new Set(helps).size).toBe(helps.length);
    }
  });
});
