import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveContactsApiBase } from '../contactApi.js';

describe('deriveContactsApiBase', () => {
  it('returns the canonical contacts path when input is empty', () => {
    assert.equal(deriveContactsApiBase(''), '/sws/neo/contacts');
    assert.equal(deriveContactsApiBase(null), '/sws/neo/contacts');
    assert.equal(deriveContactsApiBase(undefined), '/sws/neo/contacts');
  });

  it('replaces the trailing spec segment with /contacts', () => {
    assert.equal(
      deriveContactsApiBase('/sws/neo/purchase-invoice'),
      '/sws/neo/contacts',
    );
    assert.equal(deriveContactsApiBase('/sws/neo/product'), '/sws/neo/contacts');
  });

  it('preserves the host when an absolute URL is passed', () => {
    assert.equal(
      deriveContactsApiBase('https://etendo.example.com/sws/neo/sales-order'),
      'https://etendo.example.com/sws/neo/contacts',
    );
  });

  it('does not double-rewrite an already-contacts URL', () => {
    assert.equal(
      deriveContactsApiBase('/sws/neo/contacts'),
      '/sws/neo/contacts',
    );
  });
});
