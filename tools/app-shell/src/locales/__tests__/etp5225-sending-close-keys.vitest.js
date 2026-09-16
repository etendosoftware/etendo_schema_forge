import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5225 — the four labels of the "the import is still running" confirmation, shown when the
 * user tries to close the wizard mid-send.
 *
 * They reach `ImportSendingCloseDialog` through the `labels.sendingClose` slice that
 * `useWindowImportDialog` builds, so a key missing from a dictionary renders the raw key string
 * on a modal whose entire job is to be READ before the user decides. es_AR is asserted next to
 * the other two because it lags them (it carries fewer `import*` keys than en_US/es_ES) and
 * nothing else in the suite would notice a key that only went missing there.
 */

const KEYS = [
  'importSendingCloseTitle',
  'importSendingCloseBody',
  'importSendingCloseKeepWatching',
  'importSendingCloseAnyway',
];

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe.each(Object.keys(DICTIONARIES))('ETP-5225 — sending-close labels in %s', (name) => {
  const dictionary = DICTIONARIES[name];

  it.each(KEYS)('declares genericLabels.%s with a non-empty value', (key) => {
    const value = dictionary.genericLabels?.[key];
    expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
  });

  // These carry no parameters. A stray `{…}` would render literally, and a `%s`/`%0` is a
  // backend AD_MESSAGE marker useUI cannot interpolate (shipped once as ETP-5109).
  it.each(KEYS)('interpolates nothing in %s', (key) => {
    const value = dictionary.genericLabels[key];
    expect(value, `${name}.genericLabels.${key} carries a placeholder nothing fills`).not.toMatch(/\{\w+\}/);
    expect(value, `${name}.genericLabels.${key} carries a backend template marker`).not.toMatch(/%s|%\d/);
  });

  if (name !== 'en_US') {
    it.each(KEYS)('translates %s rather than copying the English entry', (key) => {
      expect(dictionary.genericLabels[key], `${name}.genericLabels.${key} is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
    });
  }
});

/**
 * The failure toast that closes the other half of the same hole: after "close anyway" the
 * RESULT step is unmounted, so a run where some rows failed used to announce only how many
 * SUCCEEDED. This key is resolved through `translate`, not through a `labels` slice, which
 * means a missing entry degrades silently to the English fallback baked into ImportDialog
 * rather than showing a raw key — nothing on screen would look wrong.
 */
describe('ETP-5225 — genericLabels.importFailedToast', () => {
  const KEY = 'importFailedToast';
  const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

  it.each(Object.keys(DICTIONARIES))('%s declares it with a non-empty value', (name) => {
    const value = DICTIONARIES[name].genericLabels?.[KEY];
    expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
  });

  // `useUI` interpolates with `text.replace('{count}', value)` — String.replace with a string
  // pattern substitutes the FIRST occurrence only, so a second `{count}` renders literally.
  it.each(Object.keys(DICTIONARIES))('%s carries {count} exactly once', (name) => {
    const value = DICTIONARIES[name].genericLabels[KEY];
    expect(value.split('{count}').length - 1, `${name}.genericLabels.${KEY}`).toBe(1);
  });

  it.each(['es_ES', 'es_AR'])('%s is translated rather than left in English', (name) => {
    expect(DICTIONARIES[name].genericLabels[KEY]).not.toBe(enUS.genericLabels[KEY]);
  });
});
