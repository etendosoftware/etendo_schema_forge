import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5349 — the reason written into the downloadable error file for a row the user skipped
 * by hand.
 *
 * It is the only reason the file has to invent. Every other skip records its own at skip time
 * (an in-file duplicate, a record that already exists) and the file simply repeats it; a
 * hand-skipped row carries no error, which is exactly why `buildErrorsCsv` used to drop it.
 *
 * `buildErrorsCsv` compiles an English default, so a missing entry here degrades SILENTLY: the
 * row appears in the file, in English, in a Spanish session. Nothing throws and nothing looks
 * broken — which is the failure this guards.
 */
const KEY = 'importSkippedByUser';
const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe(`ETP-5349 — genericLabels.${KEY}`, () => {
  it.each(Object.keys(DICTIONARIES))('%s declares it with a non-empty value', (name) => {
    const value = DICTIONARIES[name].genericLabels?.[KEY];
    expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
  });

  // It is written into a CSV cell verbatim, with nothing to interpolate. A leftover marker
  // would reach the user as literal text inside the downloaded file.
  it.each(Object.keys(DICTIONARIES))('%s carries no interpolation marker', (name) => {
    expect(DICTIONARIES[name].genericLabels[KEY]).not.toMatch(/\{[a-zA-Z]+\}|%s|%\d/);
  });

  it.each(['es_ES', 'es_AR'])('%s is translated rather than left in English', (name) => {
    expect(DICTIONARIES[name].genericLabels[KEY]).not.toBe(enUS.genericLabels[KEY]);
  });

  // It shares its column with the validation messages, so it has to read as one of them — a
  // reason, not a status word. `importSkipped` is the grid's tag ("Omitida") and is deliberately
  // NOT reused here: a bare tag in a column of sentences reads as a truncated cell.
  it.each(Object.keys(DICTIONARIES))('%s reads as a reason, not as the grid tag', (name) => {
    const dict = DICTIONARIES[name].genericLabels;
    expect(dict[KEY]).not.toBe(dict.importSkipped);
    expect(dict[KEY].length).toBeGreaterThan(dict.importSkipped.length);
  });
});
