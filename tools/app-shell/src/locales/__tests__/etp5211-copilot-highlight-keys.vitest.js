import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5211 — chrome strings of the Copilot's `highlight_element` overlay.
 *
 * The note popover's accessible name and its dismiss button are the only
 * strings the overlay itself owns (the note body is the model's own text, in
 * the language of the conversation). `useUI()` echoes the raw key when the
 * active locale has no entry — there is no locale-to-locale fallback in
 * LocaleProvider — so a gap in es_AR would render the identifier
 * `copilotHighlightDismiss` as a button tooltip rather than degrading to
 * Spanish.
 */

const KEYS = ['copilotHighlightNoteLabel', 'copilotHighlightDismiss'];
const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5211 — copilot highlight overlay labels', () => {
  for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
    it.each(KEYS)(`${name} declares genericLabels.%s with a non-empty value`, key => {
      const value = dictionary.genericLabels?.[key];
      expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
      expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
    });
  }

  it.each(KEYS)('translates %s rather than copying the English text', key => {
    expect(esES.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
    expect(esAR.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
  });

  it('keeps both Spanish locales in agreement', () => {
    for (const key of KEYS) {
      expect(esAR.genericLabels[key]).toBe(esES.genericLabels[key]);
    }
  });
});
