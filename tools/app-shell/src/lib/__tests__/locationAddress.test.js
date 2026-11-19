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

  // Regression guard (QA, ETP-5806): collapses only genuinely-empty segments, never a
  // non-empty one even when it is short or sits right next to a collapsed pair. Real
  // live example via MCP: the two consecutive blank segments ("" between "2" and "- -"
  // before "Madrid") collapse, while "2", "Madrid" and "MADRID" — all short, all
  // dash-adjacent — must survive untouched. The split-on-separator-run regex (not a literal
  // " - " split) still must never merge two non-empty segments into one.
  it('never swallows a short non-empty segment adjacent to collapsed empty ones', () => {
    const raw = 'P, 1 - 2 -  -  - Madrid - MADRID - España';
    assert.equal(
      sanitizeDashJoinedIdentifier(raw),
      'P, 1 - 2 - Madrid - MADRID - España',
    );
  });

  // @covers tools/app-shell/src/lib/locationAddress.js:sanitizeDashJoinedIdentifier
  // Bug repro (2026-11-19, post-ETP-5806 round): 2+ CONSECUTIVE blank segments joined with a
  // single shared space between dash tokens (e.g. produced by the MCP identifier builder,
  // distinct from the double-space-per-blank pattern above) were not collapsing at all.
  // `"Nave 3 - - Getafe".split(" - ")` finds only ONE match (consecutive " - " tokens share
  // a boundary space), returning `["Nave 3", "- Getafe"]` — the stray "-" survived rejoin
  // untouched. Splitting on the separator-RUN pattern `(?: -)+ ` instead collapses any number
  // of consecutive blanks in one match.
  it('collapses 2+ consecutive blank segments joined with a single shared space', () => {
    assert.equal(sanitizeDashJoinedIdentifier('Nave 3 - - Getafe'), 'Nave 3 - Getafe');
    assert.equal(
      sanitizeDashJoinedIdentifier(
        'Poligono Industrial Norte, s/n - Nave 3 - - - Getafe - - España',
      ),
      'Poligono Industrial Norte, s/n - Nave 3 - Getafe - España',
    );
  });
});
