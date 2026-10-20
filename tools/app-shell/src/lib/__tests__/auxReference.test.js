// @covers tools/app-shell/src/lib/auxReference.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuxReference, tagColumnsFromAux } from '../auxReference.js';

describe('parseAuxReference', () => {
  it('splits the Java toString of a referenced object into id and name', () => {
    assert.deepEqual(parseAuxReference('UOM(100) (name: Centimeter)'), { id: '100', name: 'Centimeter' });
  });

  it('keeps multi-word names and UUID ids', () => {
    assert.deepEqual(
      parseAuxReference('UOM(95E2A8B50A254B2AAE6774B8C2F28120) (name: Square Centimeter)'),
      { id: '95E2A8B50A254B2AAE6774B8C2F28120', name: 'Square Centimeter' },
    );
  });

  for (const bad of [null, undefined, '', '   ', 'Each', '12', 12, {}, 'UOM(X) (name: )', 'UOM(X)', 'UOM() (name: A)']) {
    it(`never invents a value from ${JSON.stringify(bad)}`, () => {
      assert.equal(parseAuxReference(bad), null);
    });
  }
});

describe('tagColumnsFromAux', () => {
  const columns = [
    { key: 'product' },
    { key: 'uOM', display: 'tag' },
    { key: 'other' },
  ];

  it('fills key and $_identifier of the tag column named after the aux suffix', () => {
    assert.deepEqual(
      tagColumnsFromAux(columns, { _UOM: 'UOM(100) (name: Centimeter)' }),
      { uOM: '100', 'uOM$_identifier': 'Centimeter' },
    );
  });

  it('matches case-insensitively', () => {
    assert.deepEqual(
      tagColumnsFromAux(columns, { _uom: 'UOM(7) (name: Unit)' }),
      { uOM: '7', 'uOM$_identifier': 'Unit' },
    );
  });

  it('does not touch a same-named column without display:tag', () => {
    assert.deepEqual(
      tagColumnsFromAux([{ key: 'uOM' }, { key: 'uOM', display: 'text' }], { _UOM: 'UOM(100) (name: Centimeter)' }),
      {},
    );
  });

  it('ignores aux suffixes with no matching column', () => {
    assert.deepEqual(tagColumnsFromAux(columns, { _PSTD: 'UOM(1) (name: X)' }), {});
  });

  for (const aux of [null, undefined, 'x', 5]) {
    it(`returns {} for aux ${JSON.stringify(aux)}`, () => {
      assert.deepEqual(tagColumnsFromAux(columns, aux), {});
    });
  }

  it('returns {} for malformed values and missing columns', () => {
    assert.deepEqual(tagColumnsFromAux(columns, { _UOM: '12' }), {});
    assert.deepEqual(tagColumnsFromAux(columns, { _UOM: 'UOM(X) (name: )' }), {});
    assert.deepEqual(tagColumnsFromAux(undefined, { _UOM: 'UOM(1) (name: A)' }), {});
  });
});
