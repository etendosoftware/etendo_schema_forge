/**
 * @covers tools/app-shell/src/components/copilot/ocr/receiverTaxIdCheck.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkReceiverTaxId, taxIdsMatch, cleanTaxId } from '../receiverTaxIdCheck.js';

const status = (receiver, org, extra = {}) =>
  checkReceiverTaxId({ receiver: { tax_id_raw: receiver }, ...extra }, org).status;

describe('receiverTaxIdCheck', () => {
  it('cleans to uppercase alphanumerics, keeping leading zeros', () => {
    assert.equal(cleanTaxId('es b-12.345 678'), 'ESB12345678');
    assert.equal(cleanTaxId('?'), '');
    assert.equal(cleanTaxId('000123'), '000123');
  });

  it('matches with the ES prefix on either side or both', () => {
    assert.equal(status('ESB12345678', 'B12345678'), 'match');
    assert.equal(status('B12345678', 'ESB12345678'), 'match');
    assert.equal(status('ES B-12345678', 'ESB12345678'), 'match');
  });

  it('treats EL and GR as the same prefix', () => {
    assert.equal(taxIdsMatch('EL123456789', 'GR123456789'), true);
    assert.equal(taxIdsMatch('EL123456789', '123456789'), true);
  });

  it('never strips a leading letter pair that is not a VAT prefix (NIE, CIF)', () => {
    assert.equal(taxIdsMatch('X1234567L', '1234567L'), false);
    assert.equal(status('X1234567L', 'X1234567L'), 'match');
    assert.equal(status('B12345678', '12345678'), 'mismatch');
  });

  it('matches a CUIT with dashes against plain digits', () => {
    assert.equal(status('30-12345678-9', '30123456789'), 'match');
  });

  it('reports a mismatch for a different id', () => {
    assert.equal(status('A99999999', 'B12345678'), 'mismatch');
  });

  it('reports absent when the receiver id is missing or blank', () => {
    assert.equal(checkReceiverTaxId({}, 'B12345678').status, 'absent');
    assert.equal(status(null, 'B12345678'), 'absent');
    assert.equal(status('  ', 'B12345678'), 'absent');
  });

  it('reports no-org-tax-id for a blank, null or "?" organization id', () => {
    assert.equal(status('B12345678', '?'), 'no-org-tax-id');
    assert.equal(status('B12345678', ''), 'no-org-tax-id');
    assert.equal(status('B12345678', null), 'no-org-tax-id');
  });

  it('reports same-as-issuer, from issuer.tax_id_raw or the legacy tax_id', () => {
    assert.equal(status('ESA999', 'B1', { issuer: { tax_id_raw: 'A999' } }), 'same-as-issuer');
    assert.equal(status('A999', 'B1', { tax_id: 'A999' }), 'same-as-issuer');
  });

  it('returns both ids for the error message', () => {
    const r = checkReceiverTaxId({ receiver: { tax_id_raw: ' A1 ' } }, ' B2 ');
    assert.deepEqual(r, { status: 'mismatch', receiverTaxId: 'A1', orgTaxId: 'B2' });
  });
});
