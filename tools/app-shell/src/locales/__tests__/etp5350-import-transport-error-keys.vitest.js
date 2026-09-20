import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5350 / QA point 11 — the import's TRANSPORT errors: the ones where the request never
 * produced a response to read.
 *
 * Until this ticket they were the one import outcome nobody translated, because they never
 * reached `classifyImportError` at all — `sendRow`'s catch handed the thrown Error straight
 * back, so its own hardcoded English `message` WAS the user-facing text: `Batch failed (500)`
 * (useBatch.js), `Unauthorized` (apiFetch's 401 branch), the browser's own `Failed to fetch`.
 * All three were printed verbatim in the review-queue row and in the blocking
 * ImportSystemErrorDialog's red line, inside a flow that is Spanish everywhere else.
 *
 * A missing entry here is SILENT and lands back exactly where it started: `useUI()` echoes the
 * key when the active locale has no entry (there is no locale-to-locale fallback in
 * LocaleProvider), and `friendlyImportMessage` reads that echo as "untranslated" and prints
 * app-shell-core's English default instead. So the user sees English again — not a bare key,
 * which is at least visible — and nothing anywhere reports it.
 *
 * es_AR is asserted alongside the other two even though none of these is Argentina-specific:
 * it is a full, independent dictionary, and it is the locale most likely to lag (it is missing
 * thousands of keys the other two have). `locales/generated/core.*.json` is gitignored build
 * output and is deliberately NOT asserted here.
 */

/** One per transport kind in app-shell-core's IMPORT_ERROR_FALLBACKS, plus the pre-flight lookup. */
const TRANSPORT_KEYS = [
  'importErrorServerFailure',
  'importErrorSessionExpired',
  'importErrorConnection',
  'importErrorTimeout',
  'importErrorLookupFailed',
];

/** The keys whose message is useless without the HTTP status interpolated into it. */
const STATUS_KEYS = ['importErrorServerFailure', 'importErrorLookupFailed'];

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5350 — import transport error i18n keys', () => {
  it.each(Object.entries(DICTIONARIES))(
    '%s declares every key in genericLabels with a non-empty value',
    (name, dictionary) => {
      for (const key of TRANSPORT_KEYS) {
        const value = dictionary.genericLabels?.[key];
        expect(typeof value, `${name}.genericLabels['${key}'] must be a string`).toBe('string');
        expect(value.trim(), `${name}.genericLabels['${key}'] must be non-empty`).not.toBe('');
      }
    },
  );

  it('declares the same set of keys in all three locales (no drift)', () => {
    for (const key of TRANSPORT_KEYS) {
      const declaredIn = Object.entries(DICTIONARIES)
        .filter(([, dictionary]) => key in (dictionary.genericLabels ?? {}))
        .map(([name]) => name);
      expect(declaredIn, `'${key}' must exist in every locale`)
        .toEqual(['en_US', 'es_ES', 'es_AR']);
    }
  });

  it('translates the Spanish locales rather than copying the English text', () => {
    // The whole point of the ticket: an entry that is still the English sentence is
    // indistinguishable, on screen, from the bug it was added to fix.
    for (const key of TRANSPORT_KEYS) {
      expect(esES.genericLabels[key], `es_ES['${key}'] is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
      expect(esAR.genericLabels[key], `es_AR['${key}'] is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
    }
  });

  it('keeps the {status} placeholder in every locale', () => {
    // `useUI` interpolates by literal `{status}` substitution and silently leaves the sentence
    // as-is when the placeholder is absent, so a translation that drops it reads "el servidor
    // rechazó la petición (error )." and the one diagnostic number is gone.
    for (const key of STATUS_KEYS) {
      for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
        expect(dictionary.genericLabels[key], `${name}['${key}'] must interpolate {status}`)
          .toContain('{status}');
      }
    }
  });

  it('tells the user a timeout is ambiguous, not a failure, in every locale', () => {
    // `/batch` has no idempotency key, so an UNKNOWN row may already have committed. Wording it
    // as a plain failure invites the retry that creates the duplicate — the message is the only
    // place that ambiguity is ever communicated.
    expect(enUS.genericLabels.importErrorTimeout.toLowerCase()).toContain('may');
    expect(esES.genericLabels.importErrorTimeout.toLowerCase()).toContain('puede');
    expect(esAR.genericLabels.importErrorTimeout.toLowerCase()).toContain('puede');
  });
});
