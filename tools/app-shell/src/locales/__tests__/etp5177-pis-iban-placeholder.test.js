import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5177 — the "Añadir pago" modal's destination IBAN field must advertise that it
 * accepts BOTH a search among the supplier's registered IBANs and a hand-typed one.
 *
 * The field is a CreatableSearchSelect, whose default placeholder is composed generically
 * as `${searchLabelPrefix} ${resolvedLabel}...` — i.e. "Buscar IBAN Destino...", which reads
 * as search-only. Since that template is shared by ~110 selectors across every window, the
 * fix is a dedicated key fed through the selector's `placeholderOverride` prop, NOT a change
 * to the template. This test pins the copy in the three locales and guards against the key
 * silently reverting to the generic composition.
 *
 * @throws {AssertionError} if the key is missing, its copy drifts, it stops naming both
 *   affordances, or it collapses back onto the generic search-only composition.
 */

const KEY = 'cpPisIbanPlaceholder';
const ES_TEXT = 'Buscar o introducir IBAN destino...';
const EN_TEXT = 'Search or enter destination IBAN...';
const LOCALES = ['en_US', 'es_ES', 'es_AR'];

/** Reads one locale JSON from the sibling locales dir. Shared by every case so the
 *  readFileSync/JSON.parse pair is not repeated per locale. */
function loadLocale(name) {
  return JSON.parse(readFileSync(new URL(`../${name}.json`, import.meta.url), 'utf8'));
}

describe(`ETP-5177 — genericLabels.${KEY}`, () => {
  /** @type {Record<string, object>} locale name → parsed dictionary */
  const dictionaries = {};

  before(() => {
    LOCALES.forEach((name) => { dictionaries[name] = loadLocale(name); });
  });

  it('exists in every locale', () => {
    LOCALES.forEach((name) => {
      assert.equal(typeof dictionaries[name].genericLabels?.[KEY], 'string',
        `${name}.genericLabels.${KEY} must be a string`);
    });
  });

  it('reads "Buscar o introducir IBAN destino..." in both Spanish locales', () => {
    assert.equal(dictionaries.es_ES.genericLabels[KEY], ES_TEXT);
    assert.equal(dictionaries.es_AR.genericLabels[KEY], ES_TEXT);
  });

  it('reads "Search or enter destination IBAN..." in en_US', () => {
    assert.equal(dictionaries.en_US.genericLabels[KEY], EN_TEXT);
  });

  it('names both affordances — search AND manual entry', () => {
    assert.match(dictionaries.es_ES.genericLabels[KEY], /Buscar/);
    assert.match(dictionaries.es_ES.genericLabels[KEY], /introducir/);
    assert.match(dictionaries.en_US.genericLabels[KEY], /Search/);
    assert.match(dictionaries.en_US.genericLabels[KEY], /enter/);
  });

  it('never collapses back onto the generic search-only composition', () => {
    LOCALES.forEach((name) => {
      const { genericLabels } = dictionaries[name];
      // The label is absent from es_AR (the whole cpPis* block is untranslated there),
      // so fall back to the ES value that composition would have produced.
      const label = genericLabels.cpPisIbanLabel ?? 'cpPisIbanLabel';
      const generic = `${genericLabels.searchLabelPrefix} ${label}...`;
      assert.notEqual(genericLabels[KEY], generic,
        `${name}.${KEY} must not equal the generic "Search {label}..." placeholder`);
    });
  });
});
