import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildLocationAddressLines, sanitizeDashJoinedIdentifier } from '../locationAddress.js';

describe('buildLocationAddressLines', () => {
  it('returns location lines in postal-friendly order', () => {
    const lines = buildLocationAddressLines({
      address: 'Pl. Mayor, 78',
      address2: '2nd floor',
      postalCode: '76746',
      city: 'Sevilla',
      'region$_identifier': 'Andalusia',
      'country$_identifier': 'Spain',
    });

    assert.deepEqual(lines, [
      'Pl. Mayor, 78',
      '2nd floor',
      '76746 Sevilla',
      'Andalusia, Spain',
    ]);
  });

  it('omits empty segments and still keeps the correct order', () => {
    const lines = buildLocationAddressLines({
      address: 'Pl. Mayor, 78',
      postalCode: '76746',
      city: 'Sevilla',
      'country$_identifier': 'Spain',
    });

    assert.deepEqual(lines, [
      'Pl. Mayor, 78',
      '76746 Sevilla',
      'Spain',
    ]);
  });

  it('supports location payloads with addressLine and cityName fields', () => {
    const lines = buildLocationAddressLines({
      addressLine1: '42 Main St',
      addressLine2: 'Suite B',
      postalCode: '10001',
      cityName: 'New York',
      regionLabel: 'NY',
      countryLabel: 'United States',
    });

    assert.deepEqual(lines, [
      '42 Main St',
      'Suite B',
      '10001 New York',
      'NY, United States',
    ]);
  });

  it('falls back to the summary string when structured fields are missing', () => {
    const lines = buildLocationAddressLines({}, 'Sevilla, Pl. Mayor, 78');
    assert.deepEqual(lines, ['Sevilla, Pl. Mayor, 78']);
  });
});

// CP-8b (ETP-5806 QA, Isa) — repro for "- -" empty separators shown in Organización/Almacén
// when the generic `$_identifier` string has blank segments (segunda línea, región).
describe('sanitizeDashJoinedIdentifier', () => {
  it('drops empty segments left by blank address parts, with no doubled or dangling separator', () => {
    const raw = 'Calle de Alcalá, 40 -  - 28014 - Madrid -  - España';
    assert.equal(
      sanitizeDashJoinedIdentifier(raw),
      'Calle de Alcalá, 40 - 28014 - Madrid - España',
    );
  });

  it('leaves an already-clean identifier untouched', () => {
    assert.equal(
      sanitizeDashJoinedIdentifier('Santa Fe - 446 - 5800 - Rio Cuarto - España'),
      'Santa Fe - 446 - 5800 - Rio Cuarto - España',
    );
  });

  it('passes through non-string input unchanged (undefined/null/empty)', () => {
    assert.equal(sanitizeDashJoinedIdentifier(undefined), '');
    assert.equal(sanitizeDashJoinedIdentifier(null), '');
    assert.equal(sanitizeDashJoinedIdentifier(''), '');
  });
});
