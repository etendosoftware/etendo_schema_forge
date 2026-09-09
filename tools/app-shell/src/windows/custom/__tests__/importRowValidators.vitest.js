import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { runImportRowValidator } from '@etendosoftware/app-shell-core/lib/import/rowValidators.js';
import '../contacts/contactsImportDescriptor.js';
import '../product/productImportDescriptor.js';

/**
 * ETP-4996 — the AD-coded columns are checked while the user is still REVIEWING the file.
 *
 * Before this, `resolveCodedCellOrThrow` only ran inside `buildOperations`, i.e. at send
 * time: a mistyped "Persona Fisica" showed up in the Correctas tab, and the user found out
 * it was wrong only after confirming the import. These tests pin the review-time half; the
 * send-time half keeps its own coverage in the descriptor tests.
 */
describe('contacts row validator', () => {
  it('accepts a row whose coded cells are blank — blank falls back to the AD default', () => {
    // The ETP-4995 blocker in miniature: an empty cell is "the row says nothing", never
    // an error. If this regresses, the downloaded template stops importing again.
    assert.deepEqual(runImportRowValidator('contacts', { name: 'Acme', taxID: 'B1' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: '', etgoIsperson: '   ' }), []);
  });

  it('accepts the human words a user actually types, accent- and case-insensitively', () => {
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: 'NIF', etgoIsperson: 'Empresa' }), []);
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: 'cif/nif', etgoIsperson: 'persona fisica' }), []);
  });

  it('accepts the raw AD code, so a CSV exported from Etendo round-trips', () => {
    assert.deepEqual(runImportRowValidator('contacts', { oBTIKTaxIDKey: '1', etgoIsperson: 'N' }), []);
  });

  it('reports an unrecognized Tax ID Type against its own column', () => {
    const errors = runImportRowValidator('contacts', { oBTIKTaxIDKey: 'Ni idea' });
    assert.deepEqual(errors.map((e) => e.target), ['oBTIKTaxIDKey']);
    // The message must name what the column accepts — otherwise the user only learns
    // that the value was rejected, never which ones would have worked.
    assert.match(errors[0].message, /NIF/);
  });

  it('reports an unrecognized contact type against its own column', () => {
    const errors = runImportRowValidator('contacts', { etgoIsperson: 'Marciano' });
    assert.deepEqual(errors.map((e) => e.target), ['etgoIsperson']);
  });

  it('reports both coded columns at once when both are wrong', () => {
    const errors = runImportRowValidator('contacts', { oBTIKTaxIDKey: 'xx', etgoIsperson: 'yy' });
    assert.deepEqual(errors.map((e) => e.target), ['oBTIKTaxIDKey', 'etgoIsperson']);
  });

  it('localizes the message through the injected translate', () => {
    const translate = (key, params) => (key === 'importErrorInvalidCodedValue'
      ? `"${params.value}" no es válido para "${params.field}".`
      : key);
    const [error] = runImportRowValidator('contacts', { etgoIsperson: 'Marciano' }, { translate });
    assert.match(error.message, /^"Marciano" no es válido para/);
  });
});

describe('product row validator', () => {
  it('accepts a blank or valid product type', () => {
    assert.deepEqual(runImportRowValidator('product', { searchKey: 'SKU-1', name: 'Widget' }), []);
    assert.deepEqual(runImportRowValidator('product', { productType: 'Servicio' }), []);
    assert.deepEqual(runImportRowValidator('product', { productType: 'S' }), []);
  });

  it('reports an unrecognized product type against its own column', () => {
    const errors = runImportRowValidator('product', { productType: 'Cosa rara' });
    assert.deepEqual(errors.map((e) => e.target), ['productType']);
  });

  it('leaves price columns alone — they are covered generically by isNumeric', () => {
    // Prices are declared `isNumeric: true` in decisions.json, so `validateRow` checks
    // them. Duplicating that here would let the two drift apart.
    assert.deepEqual(runImportRowValidator('product', { salesPrice: 'abc' }), []);
  });
});
