import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5013 — the report viewer's "Clear Result" toolbar button (data-testid
 * "action-clear-result") uses genericLabels.clearResult, a distinct concept
 * from "Limpiar filtros" (which clears filter VALUES): this button only
 * resets the generated-result flag, leaving filters untouched.
 */

describe('ETP-5013 — genericLabels.clearResult exists in both locales', () => {
  let enUS;
  let esES;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../../locales/en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../../locales/es_ES.json', import.meta.url), 'utf8'));
  });

  it('en_US.genericLabels.clearResult is "Clear Result"', () => {
    assert.equal(enUS.genericLabels.clearResult, 'Clear Result');
  });

  it('es_ES.genericLabels.clearResult is "Limpiar resultado"', () => {
    assert.equal(esES.genericLabels.clearResult, 'Limpiar resultado');
  });

  it('clearResult is distinct from the existing "clear filters" wording in both locales', () => {
    assert.doesNotMatch(enUS.genericLabels.clearResult, /filters?/i);
    assert.doesNotMatch(esES.genericLabels.clearResult, /filtros?/i);
  });
});
